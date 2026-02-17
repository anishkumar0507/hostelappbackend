export const generateReceiptNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RCPT-${ts}-${rnd}`;
};
