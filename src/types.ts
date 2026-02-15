export type Game = {
  title: string;
  slug: string;
  description?: string;
  image: string;
  fullScreenUrl: string | null;
  embedUrl: string | null;
  isComingSoon?: boolean;
};
