import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/** dynamicly import from directory in dirPath
 * @param {string } dirPath -- path
 */
export async function loadDirectory(dirPath) {
  // 1. Resolve to an absolute path from the root directory
  const absoluteDir = path.resolve(process.cwd(), dirPath);
  console.log(absoluteDir);

  // 2. Read all file names in the directory
  const files = fs.readdirSync(absoluteDir);

  for (const file of files) {
    // 3. Filter to import only JS files (skipping tests or non-JS files)
    if (file.endsWith('.js') && !file.endsWith('.test.js')) {
      const filePath = path.join(absoluteDir, file);
      
      // 4. Convert Windows/Linux file paths to valid file:// URLs for ES Modules
      const fileUrl = pathToFileURL(filePath).href;
      
      // 5. Execute the dynamic import
      await import(fileUrl);
    }
  }
}