"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

/** Reads the listing page the user is *already viewing in their own browser*
 * and opens this app's Add Building form pre-filled with what it found — a
 * convenience wrapper around copy-paste, run by the user on a page they
 * loaded themselves. It does NOT fetch anything server-side and does not try
 * to get around any site's access controls; the person is the one who
 * navigated to the page.
 *
 * Extraction prefers JSON-LD structured data (common on real-estate listing
 * pages), then falls back to OpenGraph/meta tags and a light heuristic for
 * area — whatever it can't find is just left blank for the user to fill in.
 * The bookmarklet source below is intentionally dependency-free and defensive
 * (every step wrapped so one missing field never aborts the whole thing). */
function buildBookmarklet(origin: string): string {
  // Written as a compact IIFE; `ORIGIN` is substituted with this app's origin.
  const src = `(function(){
try{
var pick=function(sel,attr){var el=document.querySelector(sel);return el?(attr?el.getAttribute(attr):el.textContent||"").trim():"";};
var d={};
try{
  var blocks=document.querySelectorAll('script[type="application/ld+json"]');
  for(var i=0;i<blocks.length;i++){
    var j;try{j=JSON.parse(blocks[i].textContent);}catch(e){continue;}
    var arr=Array.isArray(j)?j:(j['@graph']?j['@graph']:[j]);
    for(var k=0;k<arr.length;k++){var o=arr[k];if(!o||typeof o!=='object')continue;
      if(o.name&&!d.name)d.name=o.name;
      if(o.description&&!d.description)d.description=o.description;
      var a=o.address;if(a&&typeof a==='object'){
        if(a.streetAddress&&!d.address)d.address=a.streetAddress;
        if(a.postalCode&&!d.postalCode)d.postalCode=a.postalCode;
        if(a.addressLocality&&!d.city)d.city=a.addressLocality;
      }
      if(o.image&&!d.photos){d.photos=(Array.isArray(o.image)?o.image:[o.image]).slice(0,4).join(",");}
    }
  }
}catch(e){}
if(!d.name)d.name=pick('meta[property="og:title"]','content')||pick('title');
if(!d.description)d.description=pick('meta[name=description]','content')||pick('meta[property="og:description"]','content');
if(!d.photos){var og=pick('meta[property="og:image"]','content');if(og)d.photos=og;}
try{var m=(document.body.innerText||'').match(/([\\d.,]+)\\s*m(?:2|\\u00b2)/);if(m)d.totalBuildingAreaM2=m[1].replace(/[.,]/g,'');}catch(e){}
var q=Object.keys(d).filter(function(kk){return d[kk];}).map(function(kk){return kk+'='+encodeURIComponent(d[kk]);}).join('&');
window.open('${origin}/buildings/new?'+q,'_blank');
}catch(err){alert('Could not read this page: '+err);}
})();`;
  return "javascript:" + encodeURIComponent(src.replace(/\n\s*/g, ""));
}

export function BuildingBookmarklet() {
  const [origin, setOrigin] = useState("");
  // Origin is browser-only; reading it post-mount (rather than in a lazy
  // initializer) is what keeps SSR and first client render matching.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);

  if (!origin) return null;
  const href = buildBookmarklet(origin);

  return (
    <Card className="mb-8">
      <h2 className="mb-2 text-lg font-semibold">Grab from a page you&apos;re already viewing</h2>
      <p className="mb-4 text-sm text-muted">
        For sites that block automated import (Funda among them), use this instead: it reads the
        listing page open in <em>your own browser</em> and opens the Add Building form pre-filled with
        what it found, for you to review and save. Nothing is fetched behind the scenes — you&apos;re
        the one on the page.
      </p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Make your bookmarks bar visible (Ctrl/Cmd+Shift+B).</li>
        <li>
          Drag this button up onto it:{" "}
          <a
            href={href}
            onClick={(e) => e.preventDefault()}
            className="inline-block rounded-md bg-accent px-3 py-1 font-semibold text-accent-foreground no-underline"
          >
            + Add to Proposal Engine
          </a>
        </li>
        <li>Open any listing page, then click the bookmark — this form opens with the details filled in.</li>
      </ol>
      <p className="text-xs text-muted">
        Clicking it here won&apos;t do anything (it only works on a listing page). It pulls the address,
        description, photos, and area when the page exposes them; fill in anything it misses by hand.
      </p>
    </Card>
  );
}
