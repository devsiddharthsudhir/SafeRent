export type WebSearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchProvider = "serper" | "brave";