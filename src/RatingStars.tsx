import { useState } from "react";
import { t } from "./i18n";

export const ratingLabels = [
  "Not for me",
  "A little funny",
  "Enjoyable",
  "Funny",
  "Loved it",
];
export function RatingStars({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <fieldset className="rating-field" disabled={disabled}>
      <legend>{t("How funny was this story?")}</legend>
      <div className="rating-stars" onMouseLeave={() => setHover(0)}>
        {ratingLabels.map((label, i) => (
          <label
            key={label}
            className={`${(hover || value) >= i + 1 ? "filled" : ""} ${value === i + 1 ? "chosen" : ""}`}
            onMouseEnter={() => !disabled && setHover(i + 1)}
          >
            <input
              type="radio"
              name={"rating-" + id}
              value={i + 1}
              checked={value === i + 1}
              onChange={() => onChange(i + 1)}
            />
            <span className="rating-number" aria-hidden="true">
              {i + 1}
            </span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
            </svg>
            <span className="rating-word" aria-hidden="true">
              {t(label)}
            </span>
            <span className="sr-only">
              {t(i === 0 ? "{count} star: {label}" : "{count} stars: {label}", {
                count: i + 1,
                label: t(label),
              })}
            </span>
          </label>
        ))}
      </div>
      <p className="rating-caption" aria-live="polite">
        {value ? (
          <>
            {t("Your rating: {rating} out of 5 stars", { rating: value })}
            <span>{t(ratingLabels[value - 1])}</span>
          </>
        ) : (
          t("Choose 1 to 5 stars.")
        )}
      </p>
    </fieldset>
  );
}
