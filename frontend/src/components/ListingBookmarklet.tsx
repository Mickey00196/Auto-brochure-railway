"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

/** No-install alternative to the Chrome extension, for locked-down/managed
 * browsers where developer mode (and thus "Load unpacked") is disabled by
 * policy. Same principle and same compliance stance as the extension: it does
 * NOT fetch anything — it reads the listing page you already opened in your
 * own browser and opens the Add Building form pre-filled via query params.
 * Runs as a javascript: bookmarklet, so nothing is installed. */
function buildBookmarklet(origin: string): string {
  // Self-contained; `ORIGIN` is substituted with this app's origin. Mirrors
  // the extension's extractor (JSON-LD → OpenGraph → text heuristics + images).
  const src = `(function(){
try{
var B=["je bent bijna op de pagina die je zoekt","even geduld","checking your browser","verify you are human","captcha"];
var bt=(document.body?document.body.innerText:"")||"";
if(B.some(function(m){return bt.toLowerCase().indexOf(m)>-1;})){alert("Dit lijkt een verificatiepagina — open eerst de echte listing.");return;}
var o={name:null,address:null,street:null,house:null,pc:null,city:null,desc:null,energy:null,year:null,area:null,am:[],ph:[]};
var pk=function(s,a){var e=document.querySelector(s);if(!e)return null;var v=a?e.getAttribute(a):e.textContent;return v?v.trim():null;};
var L=document.querySelectorAll('script[type="application/ld+json"]');
for(var i=0;i<L.length;i++){var d;try{d=JSON.parse(L[i].textContent);}catch(e){continue;}var ar=Array.isArray(d)?d:(d["@graph"]?d["@graph"]:[d]);
for(var k=0;k<ar.length;k++){var x=ar[k];if(!x||typeof x!=="object")continue;if(x.name&&!o.name)o.name=String(x.name);if(x.description&&!o.desc)o.desc=String(x.description);var a=x.address;if(a&&typeof a==="object"){o.street=o.street||a.streetAddress||null;o.pc=o.pc||a.postalCode||null;o.city=o.city||a.addressLocality||null;}var im=x.image;if(im&&!o.ph.length){o.ph=(Array.isArray(im)?im:[im]).filter(Boolean).slice(0,8);}}}
if(!o.name)o.name=pk('meta[property="og:title"]',"content")||pk("title");
if(!o.desc)o.desc=pk('meta[name="description"]',"content")||pk('meta[property="og:description"]',"content");
if(!o.ph.length){var og=pk('meta[property="og:image"]',"content");if(og)o.ph=[og];}
var pn=function(s){if(!s)return null;var m=String(s).match(/\\d[\\d.,]*\\d|\\d/);if(!m)return null;var t=m[0];if(t.indexOf(",")>-1&&t.indexOf(".")>-1){var dc=t.lastIndexOf(",")>t.lastIndexOf(".")?",":".";var th=dc===","?".":",";t=t.split(th).join("").replace(dc,".");}else if(t.indexOf(",")>-1){var af=t.split(",").pop();t=t.split(",").join(af.length<=2?".":"");}else if(t.indexOf(".")>-1){var af2=t.split(".").pop();if(af2.length===3&&t.replace(/\\./g,"").length>3)t=t.split(".").join("");}var n=parseFloat(t);return isNaN(n)?null:n;};
var rg=bt.match(/([\\d.,]+)\\s*(?:m2|m²)?\\s*(?:tot|to|-|–|—)\\s*([\\d.,]+)\\s*(?:m2|m²)/i);var sg=bt.match(/([\\d.,]+)\\s*(?:m2|m²)/i);if(rg)o.area=pn(rg[2]);else if(sg)o.area=pn(sg[1]);
var en=bt.toUpperCase().match(/\\b([A-G])(\\+*)(?![A-Za-z0-9])/);if(en)o.energy=en[1]+en[2];
var yr=bt.match(/\\b(1[89]\\d{2}|20\\d{2})\\b/);if(yr)o.year=parseInt(yr[1],10);
if(!o.street||!o.city){var sc=o.name||document.title||bt.slice(0,200);var p=sc.match(/\\b(\\d{4})\\s?([A-Za-z]{2})\\b/);if(p&&!o.pc)o.pc=p[1]+" "+p[2].toUpperCase();var sh=sc.match(/([A-Za-zÀ-ÿ.\\-'\\s]+?)\\s+(\\d+[\\s-]?[A-Za-z]?)\\b/);if(sh){o.street=o.street||sh[1].trim();o.house=o.house||sh[2].replace(/\\s+/g,"").toUpperCase();}if(p&&!o.city){var tl=sc.slice(sc.indexOf(p[0])+p[0].length).replace(/^[\\s,–-]+/,"");if(tl)o.city=tl.split(",")[0].trim();}}
if(o.street){var l1=[o.street,o.house].filter(Boolean).join(" ");var l2=[o.pc,o.city].filter(Boolean).join(" ");o.address=[l1,l2].filter(function(s){return s&&s.trim();}).join(", ");}
var AM=["roof terrace","dakterras","bicycle storage","fietsenstalling","24/7 access","restaurant","gym","fitness","parking","parkeren","air conditioning","airconditioning","meeting room","vergaderruimte","furnished","gemeubileerd"];var lo=bt.toLowerCase();o.am=AM.filter(function(a){return lo.indexOf(a)>-1;}).map(function(a){return a.replace(/\\b\\w/g,function(c){return c.toUpperCase();});});
if(o.ph.length<4){var SK=["logo","icon","sprite","avatar","pixel","placeholder"];var ims=document.querySelectorAll("img");for(var j=0;j<ims.length;j++){var g=ims[j];var cd=[g.getAttribute("src"),g.getAttribute("data-src"),g.getAttribute("data-lazy-src"),g.getAttribute("data-original")];var ss=g.getAttribute("srcset")||g.getAttribute("data-srcset");if(ss)ss.split(",").forEach(function(pp){cd.push(pp.trim().split(" ")[0]);});for(var q=0;q<cd.length;q++){var s=cd[q];if(!s)continue;if(!/^https?:\\/\\//.test(s)&&s.charAt(0)!=="/")continue;if(SK.some(function(kk){return s.toLowerCase().indexOf(kk)>-1;}))continue;try{s=new URL(s,location.href).href;}catch(e){continue;}if(o.ph.indexOf(s)<0)o.ph.push(s);if(o.ph.length>=8)break;}if(o.ph.length>=8)break;}}
o.ph=o.ph.map(function(u){try{return new URL(u,location.href).href;}catch(e){return u;}});
var q=[];var st=function(k,v){if(v!==null&&v!==undefined&&String(v).trim()!=="")q.push(k+"="+encodeURIComponent(v));};
st("name",o.name);st("address",o.address);st("postalCode",o.pc);st("city",o.city);st("energyLabel",o.energy);st("yearBuilt",o.year);st("totalBuildingAreaM2",o.area);st("buildingAmenities",(o.am||[]).join(", "));st("description",o.desc);st("photos",(o.ph||[]).join(","));
window.open("${origin}/buildings/new?"+q.join("&"),"_blank");
}catch(err){alert("Kon deze pagina niet lezen: "+err);}
})();`;
  return "javascript:" + encodeURIComponent(src.replace(/\n\s*/g, ""));
}

export function ListingBookmarklet() {
  const [origin, setOrigin] = useState("");
  // Origin is browser-only; reading it post-mount keeps SSR/first render matching.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);

  if (!origin) return null;
  const href = buildBookmarklet(origin);

  return (
    <Card className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">Geen extensie mogelijk? Gebruik de bookmarklet</h2>
      <p className="mb-4 text-sm text-muted">
        Werkt je browser managed (developer mode uit door IT)? Deze bookmarklet doet hetzelfde als de
        Chrome-extensie — hij leest de listing die je <em>zelf open hebt</em> en opent het Add Building-formulier
        voorgevuld — maar zonder iets te installeren. Er wordt niets automatisch opgehaald.
      </p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Maak je bladwijzerbalk zichtbaar (Ctrl/Cmd+Shift+B).</li>
        <li>
          Sleep deze knop erop:{" "}
          <a
            href={href}
            onClick={(e) => e.preventDefault()}
            className="inline-block rounded-md bg-accent px-3 py-1 font-semibold text-accent-foreground no-underline"
          >
            + Capture listing
          </a>
        </li>
        <li>Open een listing die je zelf bekijkt, klik de bookmarklet → dit formulier opent voorgevuld.</li>
      </ol>
      <p className="text-xs text-muted">
        Klikken op de knop hier doet niets (werkt alleen op een listing-pagina). Zie je een verificatiepagina,
        dan meldt de bookmarklet dat in plaats van rommel op te slaan.
      </p>
    </Card>
  );
}
