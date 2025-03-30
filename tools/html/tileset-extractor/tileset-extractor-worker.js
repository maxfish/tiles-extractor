self.onmessage = function (event) {
	var data = event.data;

	if (data.action == "extract")
		extract(data.imageData, data.tileWidth, data.tileHeight, data.tolerance, data.allowFlipping);
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

function extract(imageData, tileWidth, tileHeight, tolerance, allowFlipping) {
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

	// Checks if the image area at (tileX, tileY) matches the given tile
	// Optionally checks for flipped orientations based on allowFlipping flag.
	function compareTileWith(tileX, tileY, tile) { // tile is the ImageData.data array of an existing unique tile
		// Always try normal comparison first
		if (compareOrientation(tileX, tileY, tile, 'normal')) {
			return { match: true, orientation: 'normal' }; // Return orientation
		}

		// If flipping is not allowed, stop here
		if (!allowFlipping) {
			return { match: false }; // No match
		}

		// If flipping is allowed, check other orientations
		// Try horizontal flip
		if (compareOrientation(tileX, tileY, tile, 'hflip')) {
			return { match: true, orientation: 'hflip' }; // Return orientation
		}
		// Try vertical flip
		if (compareOrientation(tileX, tileY, tile, 'vflip')) {
			return { match: true, orientation: 'vflip' }; // Return orientation
		}
		// Try both flips
		if (compareOrientation(tileX, tileY, tile, 'hvflip')) {
			return { match: true, orientation: 'hvflip' }; // Return orientation
		}

		// No match found in any allowed orientation
		return { match: false }; // No match
	}

	var numCols = (sourceWidth / tileWidth) | 0;
	var numRows = (sourceHeight / tileHeight) | 0;
	var numTiles = numCols * numRows;
	var tiles = [];
	var map = [];
	var index;
	var matchedOrientation;

	for (var tileIndex = 0; tileIndex < numTiles; ++tileIndex) {
		var tileX = (tileIndex % numCols) | 0;
		var tileY = (tileIndex / numCols) | 0;

		var tileExist = false;
		matchedOrientation = 'normal'; // Default orientation

		for (index = 0; index < tiles.length; ++index) {
			const result = compareTileWith(tileX, tileY, tiles[index].data);
			if (result.match) {
				tileExist = true;
				matchedOrientation = result.orientation; // Store the matched orientation
				break;
			}
		}
		if (!tileExist) {
			tiles.push(createTileFrom());
			matchedOrientation = 'normal'; // Newly added tile is always 'normal'
			// index variable already holds the correct new index (tiles.length - 1)
			// If the loop finished without break, index will be tiles.length.
			// After push, the new index is tiles.length - 1. So we need to adjust.
			if (index === tiles.length) {
				index = tiles.length - 1;
			}
		}

		// Store both index and orientation
		map.push({ index: index, orientation: matchedOrientation });

		if (tileIndex % 32 == 0) {
			sendProgress(tileIndex / numTiles);
		}
	}
	sendResult(tiles, map, startTime);
}