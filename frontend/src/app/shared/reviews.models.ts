export interface ReviewAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Review {
  id: string;
  author: ReviewAuthor;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** Respuesta pública del vendedor. */
  sellerReply: string | null;
  sellerReplyAt: string | null;
}

/** Si ya puedes reseñar un grupo (pago validado y 7 días con el servicio) y, si no, por qué. */
export interface ReviewEligibility {
  canReview: boolean;
  reason: string | null;
  eligibleAt: string | null;
  hasReview: boolean;
}

export interface PaginatedReviews {
  data: Review[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
