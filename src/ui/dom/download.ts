/** Save text or a blob as a file through a temporary link. */
export function download(name: string, data: string | Blob, type = 'application/json'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A title reduced to characters safe in a file name. */
export const fileStem = (title: string): string => title.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'robot';
