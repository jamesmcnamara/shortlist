export const getMonth = (date: Date = new Date()) => 
  date.getMonth() + (12 * (date.getFullYear() - 1))