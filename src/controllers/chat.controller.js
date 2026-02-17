import Chat from '../models/Chat.model.js';
import Parent from '../models/Parent.model.js';
import Student from '../models/Student.model.js';
import User from '../models/User.model.js';

/**
 * Get or create chat between parent and warden for a student
 */
const getOrCreateChat = async (parentUserId, wardenUserId, studentId, institutionId) => {
  let chat = await Chat.findOne({
    parentId: parentUserId,
    studentId,
    institutionId,
  }).populate('wardenId', 'name');

  if (!chat) {
    chat = await Chat.create({
      parentId: parentUserId,
      wardenId: wardenUserId,
      studentId,
      institutionId,
    });
    await chat.populate('wardenId', 'name');
  }
  return chat;
};

/**
 * @desc    Parent: Get or create chat with warden for their child
 * @route   GET /api/chat
 * @access  Private (Parent only)
 */
export const getMyChat = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent profile not found',
      });
    }

    // Get any warden - for simplicity, we use the first one
    // In production, you might have multiple wardens; we'll get the chat that exists or create with a default
    const student = await Student.findOne({ _id: parent.studentId, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const warden = await User.findOne({ role: 'warden', institutionId: req.user.institutionId });
    if (!warden) {
      return res.status(404).json({
        success: false,
        message: 'No warden available',
      });
    }

    const chat = await getOrCreateChat(req.user._id, warden._id, parent.studentId, req.user.institutionId);
    await chat.populate('messages.senderId', 'name role');

    res.status(200).json({
      success: true,
      data: {
        id: chat._id,
        studentId: chat.studentId,
        warden: chat.wardenId ? { id: chat.wardenId._id, name: chat.wardenId.name } : null,
        messages: (chat.messages || []).map((m) => ({
          id: m._id,
          senderId: m.senderId?._id,
          senderName: m.senderId?.name,
          senderRole: m.senderId?.role,
          text: m.text,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('getMyChat error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Parent: Send message to warden
 * @route   POST /api/chat/message
 * @access  Private (Parent only)
 */
export const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide message text',
      });
    }

    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent profile not found',
      });
    }

    const warden = await User.findOne({ role: 'warden', institutionId: req.user.institutionId });
    if (!warden) {
      return res.status(404).json({
        success: false,
        message: 'No warden available',
      });
    }

    const chat = await getOrCreateChat(req.user._id, warden._id, parent.studentId, req.user.institutionId);
    chat.messages = chat.messages || [];
    chat.messages.push({
      senderId: req.user._id,
      text: text.trim(),
    });
    await chat.save();

    // Reload and populate the message
    await chat.populate('messages.senderId', 'name role');
    const lastMsg = chat.messages[chat.messages.length - 1];

    res.status(201).json({
      success: true,
      data: {
        id: lastMsg._id,
        senderId: lastMsg.senderId._id,
        senderName: lastMsg.senderId.name,
        senderRole: lastMsg.senderId.role,
        text: lastMsg.text,
        createdAt: lastMsg.createdAt,
      },
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Warden: Get all chats (with parents)
 * @route   GET /api/chat/warden
 * @access  Private (Warden only)
 */
export const getWardenChats = async (req, res) => {
  try {
    const chats = await Chat.find({ wardenId: req.user._id, institutionId: req.user.institutionId })
      .populate('parentId', 'name email')
      .populate('studentId')
      .populate('studentId.userId', 'name')
      .sort({ updatedAt: -1 });

    const result = chats.map((c) => ({
      id: c._id,
      parent: c.parentId ? { id: c.parentId._id, name: c.parentId.name, email: c.parentId.email } : null,
      student: c.studentId
        ? {
            id: c.studentId._id,
            name: c.studentId.userId?.name,
            room: c.studentId.room,
          }
        : null,
      lastMessage: c.messages?.length
        ? c.messages[c.messages.length - 1]
        : null,
      messageCount: c.messages?.length || 0,
    }));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('getWardenChats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Warden: Get chat with specific parent for a student
 * @route   GET /api/chat/warden/:chatId
 * @access  Private (Warden only)
 */
export const getWardenChatById = async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, institutionId: req.user.institutionId })
      .populate('parentId', 'name email')
      .populate('wardenId', 'name')
      .populate('studentId')
      .populate('studentId.userId', 'name')
      .populate('messages.senderId', 'name role');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    if (chat.wardenId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: chat._id,
        parent: chat.parentId,
        student: chat.studentId,
        messages: (chat.messages || []).map((m) => ({
          id: m._id,
          senderId: m.senderId?._id,
          senderName: m.senderId?.name,
          senderRole: m.senderId?.role,
          text: m.text,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('getWardenChatById error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Warden: Reply to parent in chat
 * @route   POST /api/chat/warden/:chatId/message
 * @access  Private (Warden only)
 */
export const wardenSendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const { chatId } = req.params;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide message text',
      });
    }

    const chat = await Chat.findOne({ _id: chatId, institutionId: req.user.institutionId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    if (chat.wardenId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    chat.messages = chat.messages || [];
    chat.messages.push({
      senderId: req.user._id,
      text: text.trim(),
    });
    await chat.save();

    await chat.populate('messages.senderId', 'name role');
    const lastMsg = chat.messages[chat.messages.length - 1];

    res.status(201).json({
      success: true,
      data: {
        id: lastMsg._id,
        senderId: lastMsg.senderId._id,
        senderName: lastMsg.senderId.name,
        senderRole: lastMsg.senderId.role,
        text: lastMsg.text,
        createdAt: lastMsg.createdAt,
      },
    });
  } catch (error) {
    console.error('wardenSendMessage error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
