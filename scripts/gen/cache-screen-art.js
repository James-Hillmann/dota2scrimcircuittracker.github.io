// Cache the pack catalog's Steam artwork as site assets. Run after gen-screen-art.js.
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {SCREEN_ART} from '../../public/lib/screen-art-data.js';
const directory=new URL('../../public/img/loading-screens/',import.meta.url);
await mkdir(directory,{recursive:true});
let cursor=0;const failed=[];
await Promise.all(Array.from({length:8},async()=>{
  while(cursor<SCREEN_ART.length){
    const screen=SCREEN_ART[cursor++];
    try {
      const response=await fetch(`https://community.fastly.steamstatic.com/economy/image/${screen.icon}`,{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const output=await sharp(Buffer.from(await response.arrayBuffer())).resize({width:1600,withoutEnlargement:true}).webp({quality:85}).toBuffer();
      await writeFile(new URL(`${screen.id.slice(4)}.webp`,directory),output);
    } catch(error){failed.push({id:screen.id,error:error.message});}
  }
}));
console.log(JSON.stringify({cached:SCREEN_ART.length-failed.length,failed}));
if(failed.length)process.exitCode=1;
