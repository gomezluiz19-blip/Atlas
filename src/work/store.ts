// Saved Work projects (plans, presentations, fields), kept in this browser.
export class ListStore<T extends { id: string }> {
  private items: T[] = [];

  constructor(private key: string) {
    this.reload();
  }

  /** Re-reads the saved list (after something else changed it). */
  reload() {
    try {
      const v = JSON.parse(localStorage.getItem(this.key) ?? "[]");
      this.items = Array.isArray(v) ? v : [];
    } catch {
      this.items = [];
    }
  }

  all(): T[] {
    return this.items;
  }

  get(id: string): T | undefined {
    return this.items.find((x) => x.id === id);
  }

  save(item: T) {
    const i = this.items.findIndex((x) => x.id === item.id);
    if (i >= 0) this.items[i] = item;
    else this.items.unshift(item);
    this.persist();
  }

  remove(id: string) {
    this.items = this.items.filter((x) => x.id !== id);
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.items));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Downloads text as a file. */
export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
