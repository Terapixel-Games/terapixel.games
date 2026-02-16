export type GameFaq = {
  question: string;
  answer: string;
};

export type Game = {
  title: string;
  slug: string;
  description?: string;
  image: string;
  seoIntro?: string;
  seoDetails?: string;
  seoHowToPlay?: string;
  seoFeatures?: string[];
  faq?: GameFaq[];
  fullScreenUrl: string | null;
  embedUrl: string | null;
  isComingSoon?: boolean;
};
