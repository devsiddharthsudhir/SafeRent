import { Bath, Bed, MapPin } from "lucide-react";
import type { Listing } from "../lib/types";

type Props = {
  listing: Listing;
  active?: boolean;
  onOpen?: () => void;
};

export default function BrowserCard({ listing, active, onOpen }: Props) {
  const img = listing.image_urls?.[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full text-left",
        "rounded-2xl",
        "glass",
        "p-3",
        "transition",
        "hover:opacity-95",
        "focus-ring",
        "min-w-0", // critical: allow this grid item to shrink
        "soft-border",
        active ? "ring-soft" : "",
      ].join(" ")}
    >
      <div className="flex gap-3 min-w-0">
        {/* Thumbnail (smaller so it never forces overflow) */}
        <div className="shrink-0">
          {img ? (
            <img
              src={img}
              alt=""
              className="h-14 w-20 rounded-xl object-cover soft-border"
            />
          ) : (
            <div className="h-14 w-20 rounded-xl soft-border" style={{ background: "rgba(255,255,255,0.04)" }} />
          )}
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          {/* Top row: title + price */}
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <div className="text-sm font-semibold clamp-1 break-words">
                {listing.title || "Listing"}
              </div>

              {/* Meta row (wraps instead of overflowing) */}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs subtle">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} />
                  {[listing.neighborhood, listing.city].filter(Boolean).join(", ") || "—"}
                </span>

                <span className="inline-flex items-center gap-1">
                  <Bed size={14} />
                  {typeof listing.bedrooms === "number" ? `${listing.bedrooms} bed` : "—"}
                </span>

                <span className="inline-flex items-center gap-1">
                  <Bath size={14} />
                  {typeof listing.bathrooms === "number" ? `${listing.bathrooms} bath` : "—"}
                </span>
              </div>
            </div>

            {/* Price block (cannot expand width) */}
            <div className="shrink-0 text-right">
              <div className="text-xs subtle">{listing.currency || "CAD"}</div>
              <div className="text-sm font-semibold leading-tight">
                {listing.price ? listing.price : "-"}
              </div>
              <div className="text-[11px] subtle leading-tight">per month</div>
            </div>
          </div>

          {/* Description (clamped so it doesn't get chopped mid-layout) */}
          <div className="mt-2 text-sm subtle clamp-2 break-words">
            {listing.description || "No description provided."}
          </div>
        </div>
      </div>
    </button>
  );
}
