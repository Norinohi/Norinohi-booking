"use client";

import { useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { recordListingViewMutationOptions } from "../../api/queries";
import { viewerId } from "../../lib/viewer-id";

/**
 * Renders nothing; its only job is to tell the server this listing was looked at, so
 * "N people viewed today" counts real visits.
 *
 * It has to run on the client. The detail route's read is cached for an hour, so a
 * server-side count would follow cache misses rather than visitors, and would miss
 * every soft navigation into the page.
 *
 * The server already ignores a repeat view from the same visitor on the same day; the
 * ref here only keeps a re-render or Strict Mode's double mount from sending it twice.
 */
export default function RecordView() {
  const { id } = useParams<{ id: string }>();
  const { mutate } = useMutation(recordListingViewMutationOptions());
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === id) return;

    const viewer = viewerId();
    if (!viewer) return;

    // `mutate` never throws and no MutationCache handler toasts, so a failed count
    // stays silent — an uncounted view is not worth interrupting the visitor for.
    mutate({ id, viewer });
  }, [id, mutate]);

  return null;
}
