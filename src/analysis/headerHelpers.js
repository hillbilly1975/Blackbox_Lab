export function findHeader(headers, words) {
  return headers.find((header) => {
    const lower = header.toLowerCase();

    return words.some((word) => lower.includes(word));
  });
}