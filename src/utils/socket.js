let io = null;

export const setIO = (socketIo) => {
  io = socketIo;
};

export const getIO = () => io;
