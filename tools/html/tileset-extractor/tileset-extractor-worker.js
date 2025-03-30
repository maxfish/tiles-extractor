self.onmessage = function (event) {
	var data = event.data;

	if (data.action == "extract")
		extract(data.imageData, data.tileWidth, data.tileHeight, data.tolerance);
};

function sendStart() {
	self.postMessage({ action: "extract-start" });
}

function sendProgress(progress) {
	self.postMessage({
		action: "extract-progress",
		progress: progress
	});
}

function sendResult(tiles, map, startTime) {
	self.postMessage({
		action: "extract-result",
		tiles: tiles,
		map: map,
		time: new Date().getTime() - startTime
	}
	);
}

function extract(imageData, tileWidth, tileHeight, tolerance) {
	sendStart();

	var startTime = new Date().getTime();

	var sourceWidth = imageData.width;
	var sourceHeight = imageData.height;
	var sourceArray = imageData.data;

	function createTileFrom() {
		var tileData = new ImageData(tileWidth, tileHeight);
		var deltaX = tileX * tileWidth;
		var deltaY = tileY * tileHeight;
		var tileArray = tileData.data;
		var tileIndex = 0;

		for (var y = 0; y < tileHeight; ++y) {
			for (var x = 0; x < tileWidth; ++x) {
				var sourceIndex = ((deltaY + y) * sourceWidth + (deltaX + x)) << 2;

				for (var i = 0; i < 4; ++i)
					tileArray[tileIndex++] = sourceArray[sourceIndex++];
			}
		}
		return tileData;
	}

	// Helper function for comparing different orientations against a tile candidate area
	function compareOrientation(baseTileX, baseTileY, tileData, orientation) {
		var deltaX = baseTileX * tileWidth;
		var deltaY = baseTileY * tileHeight;
		var targetIndex = 0;
		var difference = 0;

		for (var y = 0; y < tileHeight; ++y) {
			for (var x = 0; x < tileWidth; ++x) {
				var sourcePixelX, sourcePixelY;

				// Calculate the source pixel coordinates based on orientation
				switch (orientation) {
					case 'hflip': // Horizontal flip
						sourcePixelX = deltaX + tileWidth - 1 - x;
						sourcePixelY = deltaY + y;
						break;
					case 'vflip': // Vertical flip
						sourcePixelX = deltaX + x;
						sourcePixelY = deltaY + tileHeight - 1 - y;
						break;
					case 'hvflip': // Both horizontal and vertical flip
						sourcePixelX = deltaX + tileWidth - 1 - x;
						sourcePixelY = deltaY + tileHeight - 1 - y;
						break;
					case 'normal':
					default: // Normal (no flip)
						sourcePixelX = deltaX + x;
						sourcePixelY = deltaY + y;
						break;
				}

				// Basic bounds check (should not happen with correct tileX/tileY but safe)
				if (sourcePixelX < 0 || sourcePixelX >= sourceWidth || sourcePixelY < 0 || sourcePixelY >= sourceHeight) {
					console.warn("Calculated source pixel out of bounds.", { sourcePixelX, sourcePixelY, sourceWidth, sourceHeight });
					return false; // Coordinate out of source image bounds implies no match for this orientation
				}

				var sourceIndex = (sourcePixelY * sourceWidth + sourcePixelX) << 2; // Calculate base index for the pixel (RGBA)

				// Compare RGBA values for the pixel
				for (var i = 0; i < 4; ++i) {
					// Ensure indices are valid before accessing array elements
					if (targetIndex >= tileData.length || sourceIndex + i >= sourceArray.length) {
						console.error("Index out of bounds during comparison:", { targetIndex, tileDataLength: tileData.length, sourceIndex, i, sourceArrayLength: sourceArray.length });
						return false; // Critical error: index out of bounds
					}
					difference += Math.abs(tileData[targetIndex++] - sourceArray[sourceIndex + i]);
				}

				// Early exit if tolerance is exceeded
				if (tolerance < difference) {
					return false;
				}
			}
		}
		// If all pixels are compared and the difference is within tolerance, it's a match
		return true;
	}

	// Checks if the image area at (tileX, tileY) matches the given tile in normal, h-flipped, v-flipped, or hv-flipped orientation.
	function compareTileWith(tileX, tileY, tile) { // tile is the ImageData.data array of an existing unique tile
		// Try normal comparison
		if (compareOrientation(tileX, tileY, tile, 'normal')) {
			return true;
		}
		// Try horizontal flip
		if (compareOrientation(tileX, tileY, tile, 'hflip')) {
			return true;
		}
		// Try vertical flip
		if (compareOrientation(tileX, tileY, tile, 'vflip')) {
			return true;
		}
		// Try both flips
		if (compareOrientation(tileX, tileY, tile, 'hvflip')) {
			return true;
		}
		// No match in any orientation
		return false;
	}

	var numCols = (sourceWidth / tileWidth) | 0;
	var numRows = (sourceHeight / tileHeight) | 0;
	var numTiles = numCols * numRows;
	var tiles = [];
	var map = [];
	var index;

	for (var tileIndex = 0; tileIndex < numTiles; ++tileIndex) {
		var tileX = (tileIndex % numCols) | 0;
		var tileY = (tileIndex / numCols) | 0;

		var tileExist = false;

		for (index = 0; index < tiles.length; ++index) {
			if (compareTileWith(tileX, tileY, tiles[index].data)) {
				tileExist = true;
				break;
			}
		}
		if (!tileExist) {
			tiles.push(createTileFrom());
		}

		map.push(index);

		if (tileIndex % 32 == 0) {
			sendProgress(tileIndex / numTiles);
		}
	}
	sendResult(tiles, map, startTime);
}