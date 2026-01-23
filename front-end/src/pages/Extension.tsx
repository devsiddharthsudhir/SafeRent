
export default function Extension() {
  return (
    <div className="glass rounded-2xl p-6 max-w-3xl">
      <div className="text-2xl font-semibold">SAFERENT Import Extension</div>
      <div className="text-sm subtle mt-2">
        Some rental sites block automatic server link import. The extension imports directly from the page you are viewing,
        which is more reliable for most listings.
      </div>

      <div className="mt-5 chip rounded-xl p-4">
        <div className="text-sm font-semibold">Install locally (developer mode)</div>
        <ol className="mt-2 text-sm space-y-2 list-decimal list-inside">
          <li>Open Chrome and go to <span className="font-mono">chrome://extensions</span></li>
          <li>Enable <b>Developer mode</b> (top right)</li>
          <li>Click <b>Load unpacked</b></li>
          <li>Select the <span className="font-mono">extension/</span> folder from this project</li>
          <li>Open a listing page in a tab, then click the extension icon to import into SAFERENT</li>
        </ol>
      </div>

      <div className="mt-4 chip rounded-xl p-4">
        <div className="text-sm font-semibold">For commercial release</div>
        <div className="text-sm subtle mt-1">
          Publish the extension to the Chrome Web Store and set the import URL in the extension file to your deployed
          frontend domain.
        </div>
      </div>
    </div>
  );
}
