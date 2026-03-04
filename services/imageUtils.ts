
/**
 * Processes an image file, removing white/near-white background pixels 
 * to make them transparent.
 */
export const processSignatureImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }
  
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
  
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Threshold for "White"
          const threshold = 220;
  
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // If pixel is light enough, make it transparent
            if (r > threshold && g > threshold && b > threshold) {
              data[i + 3] = 0; // Alpha to 0
            }
          }
  
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
