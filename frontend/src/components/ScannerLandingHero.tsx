type ScannerLandingHeroProps = {
  hidden?: boolean;
};

/** Soft atmosphere — cream blush in light, violet/magenta washes in dark. */
export default function ScannerLandingHero({ hidden }: ScannerLandingHeroProps) {
  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-0 overflow-hidden bg-canvas transition-opacity duration-300 ${
        hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute -right-[20%] top-[-10%] h-[70vmin] w-[70vmin] rounded-full bg-blush blur-3xl dark:bg-brand/20" />
      <div className="absolute -left-[15%] bottom-[10%] h-[50vmin] w-[50vmin] rounded-full bg-brand/10 blur-3xl dark:bg-accent/15" />
      <div className="absolute right-[10%] bottom-[-5%] h-[40vmin] w-[40vmin] rounded-full bg-blush/80 blur-3xl dark:bg-brand/10" />
    </div>
  );
}
