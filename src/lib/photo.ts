/** Reduce una foto del móvil a 1600 px en JPEG antes de guardarla o enviarla. */
export async function shrinkPhoto(file: File, max = 1600): Promise<Blob> {
	try {
		const bmp = await createImageBitmap(file);
		const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bmp.width * scale);
		canvas.height = Math.round(bmp.height * scale);
		canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve) =>
			canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82)
		);
	} catch {
		return file;
	}
}
