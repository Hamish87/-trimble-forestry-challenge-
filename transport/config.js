/* Holztransport demo · runtime configuration (no build step).
   mapboxToken: a Mapbox *public* token (pk.…) switches every map in the demo to Mapbox GL JS; empty keeps the
   built-in tile map (OpenStreetMap · basemap.de · OpenTopoMap). Public tokens are shipped to the browser by design —
   restrict the token to this demo's URLs (holztransport-demo.vercel.app, localhost) in the Mapbox account. A token
   entered under Verwaltung → Einstellungen is stored in the browser workspace and takes precedence over this file.
   mapboxStyle: outdoors · satellite · streets · light (see core/mapbox.js). */
globalThis.TransportConfig=Object.assign({mapboxToken:'',mapboxStyle:'outdoors'},globalThis.TransportConfig||{});
