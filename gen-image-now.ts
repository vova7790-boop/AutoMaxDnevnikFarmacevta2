import { generateImage } from './src/generate-image';
import { readFileSync } from 'fs';

async function main() {
  const { imagePrompt } = JSON.parse(readFileSync('./post-content.json', 'utf-8'));
  await generateImage(imagePrompt, 'post-image.png');
  console.log('DONE');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
