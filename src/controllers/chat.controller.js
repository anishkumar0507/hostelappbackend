import Chat from '../models/Chat.model.js';
import Parent from '../models/Parent.model.js';
import User from '../models/User.model.js';
import { getIO } from '../utils/socket.js';
import { notifyUser } from '../services/notification.service.js';

/**
 * Get or create chat between parent and warden for a student
 */
const getOrCreateChat = async (parentUserId, wardenUserId, studentId, institutionId) => {
  let chat = await Chat.findOne({
    parentId: parentUserId,
    wardenId: wardenUserId,
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

const formatMessage = (message) => ({
  id: message._id,
  senderId: message.senderId?._id,
  senderName: message.senderId?.name,
  senderRole: message.senderId?.role,
  text: message.text,
  createdAt: message.createdAt,
});

const formatParentChat = (chat) => ({
  id: chat._id,
  studentId: chat.studentId,
  warden: chat.wardenId ? { id: chat.wardenId._id, name: chat.wardenId.name } : null,
  messages: (chat.messages || []).map(formatMessage),
});

const formatWardenChat = (chat) => ({
  id: chat._id,
  parent: chat.parentId,
  student: chat.studentId,
  messages: (chat.messages || []).map(formatMessage),
});

const getParentProfile = async (userId, institutionId) => {
  return Parent.findOne({ userId, institutionId });
};

const getParentChatById = async (chatId, parentUserId, institutionId) => {
  return Chat.findOne({ _id: chatId, parentId: parentUserId, institutionId })
    .populate('wardenId', 'name')
    .populate('messages.senderId', 'name role');
};

const getWardenChatRecord = async (chatId, institutionId) => {
  return Chat.findOne({ _id: chatId, institutionId })
    .populate('parentId', 'name email')
    .populate('wardenId', 'name')
    .populate('studentId')
    .populate('studentId.userId', 'name')
    .populate('messages.senderId', 'name role');
};

/**
 * @desc    Create or fetch a chat using an explicit receiver
 * @route   POST /api/chats/initiate
 * @access  Private (Parent or Warden)
 */
export const initiateChat = async (req, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide receiverId',
      });
    }

    if (req.user.role === 'warden') {
      const parentRecord = await Parent.findOne({
        userId: receiverId,
        institutionId: req.user.institutionId,
      });

      if (!parentRecord) {
        return res.status(404).json({
          success: false,
          message: 'Parent not found',
        });
      }

      const chat = await getOrCreateChat(
        receiverId,
        req.user._id,
        parentRecord.studentId,
        req.user.institutionId
      );

      const populatedChat = await getWardenChatRecord(chat._id, req.user.institutionId);

      return res.status(200).json({
        success: true,
        data: formatWardenChat(populatedChat),
      });
    }

    if (req.user.role === 'parent') {
      const parent = await getParentProfile(req.user._id, req.user.institutionId);
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent profile not found',
        });
      }

      const warden = await User.findOne({
        _id: receiverId,
        role: 'warden',
        institutionId: req.user.institutionId,
      });

      if (!warden) {
        return res.status(404).json({
          success: false,
          message: 'Warden not found',
        });
      }

      const chat = await getOrCreateChat(
        req.user._id,
        warden._id,
        parent.studentId,
        req.user.institutionId
      );

      const populatedChat = await getParentChatById(chat._id, req.user._id, req.user.institutionId);

      return res.status(200).json({
        success: true,
        data: formatParentChat(populatedChat),
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Not authorized to initiate chat',
    });
  } catch (error) {
    console.error('initiateChat error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Parent: Get or create chat with warden for their child
 * @route   GET /api/chat
 * @access  Private (Parent only)
 */
export const getMyChat = async (req, res) => {
  try {
    const { receiverId, chatId } = req.query;

    const parent = await getParentProfile(req.user._id, req.user.institutionId);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent profile not found',
      });
    }

    let chat = null;

    if (chatId) {
      chat = await getParentChatById(chatId, req.user._id, req.user.institutionId);
    } else if (receiverId) {
      const warden = await User.findOne({
        _id: receiverId,
        role: 'warden',
        institutionId: req.user.institutionId,
      });

      if (!warden) {
        return res.status(404).json({
          success: false,
          message: 'Warden not found',
        });
      }

      const currentChat = await getOrCreateChat(req.user._id, warden._id, parent.studentId, req.user.institutionId);
      chat = await getParentChatById(currentChat._id, req.user._id, req.user.institutionId);
    } else {
      chat = await Chat.findOne({
        parentId: req.user._id,
        studentId: parent.studentId,
        institutionId: req.user.institutionId,
      })
        .sort({ updatedAt: -1 })
        .populate('wardenId', 'name')
        .populate('messages.senderId', 'name role');
    }

    res.status(200).json({
      success: true,
      data: chat ? formatParentChat(chat) : null,
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
    const { text, chatId, receiverId } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide message text',
      });
    }

    let chat = null;

    if (chatId) {
      chat = await Chat.findOne({
        _id: chatId,
        parentId: req.user._id,
        institutionId: req.user.institutionId,
      });
    } else if (receiverId) {
      const parent = await getParentProfile(req.user._id, req.user.institutionId);
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent profile not found',
        });
      }

      const warden = await User.findOne({
        _id: receiverId,
        role: 'warden',
        institutionId: req.user.institutionId,
      });

      if (!warden) {
        return res.status(404).json({
          success: false,
          message: 'Warden not found',
        });
      }

      chat = await getOrCreateChat(req.user._id, warden._id, parent.studentId, req.user.institutionId);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide chatId or receiverId',
      });
    }

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    chat.messages = chat.messages || [];
    chat.messages.push({
      senderId: req.user._id,
      text: text.trim(),
    });
    await chat.save();

    // Reload and populate the message
    await chat.populate('messages.senderId', 'name role');
    const lastMsg = chat.messages[chat.messages.length - 1];

    const messageData = {
      id: lastMsg._id,
      senderId: lastMsg.senderId._id,
      senderName: lastMsg.senderId.name,
      senderRole: lastMsg.senderId.role,
      text: lastMsg.text,
      createdAt: lastMsg.createdAt,
      chatId: chat._id,
    };

    // Emit socket event to warden for real-time update.
    try {
      const io = getIO();
      if (io) {
        io.to(`warden_${chat.wardenId}`).emit('newChatMessage', messageData);
      }

      await notifyUser({
        institutionId: req.user.institutionId,
        userId: chat.wardenId,
        type: 'chat',
        title: 'New Message from Parent',
        message: `${messageData.senderName}: ${lastMsg.text}`,
        referenceId: chat._id,
        socketEvent: 'notification:new',
        pushData: { type: 'chat', chatId: String(chat._id) },
      });
    } catch (socketError) {
      console.error('Socket emit error:', socketError);
    }

    res.status(201).json({
      success: true,
      data: messageData,
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
    const chat = await getWardenChatRecord(req.params.chatId, req.user.institutionId);

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
      data: formatWardenChat(chat),
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

    const messageData = {
      id: lastMsg._id,
      senderId: lastMsg.senderId._id,
      senderName: lastMsg.senderId.name,
      senderRole: lastMsg.senderId.role,
      text: lastMsg.text,
      createdAt: lastMsg.createdAt,
      chatId: chat._id,
    };

    // Emit socket event to parent for real-time update.
    try {
      const io = getIO();
      if (io) {
        io.to(`parent_${chat.parentId}`).emit('newChatMessage', messageData);
      }

      await notifyUser({
        institutionId: req.user.institutionId,
        userId: chat.parentId,
        type: 'chat',
        title: 'New Message from Warden',
        message: `${messageData.senderName}: ${lastMsg.text}`,
        referenceId: chat._id,
        socketEvent: 'notification:new',
        pushData: { type: 'chat', chatId: String(chat._id) },
      });
    } catch (socketError) {
      console.error('Socket emit error:', socketError);
    }

    res.status(201).json({
      success: true,
      data: messageData,
    });
  } catch (error) {
    console.error('wardenSendMessage error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
