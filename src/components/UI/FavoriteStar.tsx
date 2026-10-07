/** Gold star for favorites: gold is reserved for Bituin, celebration and this. */
export function FavoriteStar({ size = 16, className }: { size?: number; className?: string }): React.ReactNode {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className}>
      <path
        d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.8 6.3 20l1.4-6.3L2.9 9.4l6.4-.7z"
        fill="rgb(var(--c-gold))"
        stroke="rgb(var(--c-gold-ink))"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
