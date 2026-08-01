// Initializes one AdSense request per <ins class="adsbygoogle"> placeholder
// on the page (top banner, side rails, inline result slot, footer banner).
// Each ad unit needs its own push() call. Wrapped in try/catch because this
// throws if the AdSense script failed to load (ad blocker, placeholder
// client ID not yet activated, offline dev) and that must never break the
// actual conversion tool.
document.querySelectorAll('ins.adsbygoogle').forEach(() => {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (err) {
    console.warn('AdSense slot failed to initialize', err);
  }
});
