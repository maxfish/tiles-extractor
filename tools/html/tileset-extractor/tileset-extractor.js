function onLoad() {
    const choose = document.querySelector('input[type="file"]');
    const loadDemoButton = document.querySelector('button[demo]');
    const loadDemoBigButton = document.querySelector('button[demo-big]');
    const tileWidthInput = document.querySelector('input[name="tile-width"]');
    const tileHeightInput = document.querySelector('input[name="tile-height"]');
    const toleranceInput = document.querySelector('input[name="tolerance"]');
    const progress = document.querySelector('progress');
    const consoleLayer = document.querySelector('div[console]');
    const tilesLayer = document.querySelector('div[tiles]');
    const tilesetLayer = document.querySelector('div[tileset]');
    const resultLayer = document.querySelector('div[result]');
    const downloadMapLink = document.querySelector("a[download-map]");
    const downloadTilesLink = document.querySelector("a[download-tiles]");
    const downloadTileMapLink = document.querySelector("a[download-tilemap]");
    const downloadTiledTMXLink = document.querySelector("a[download-tmx]");
    const processButton = document.getElementById("process-button");
    const allowFlippingCheckbox = document.getElementById("allow-flipping");
    const exportColumnsInput = document.getElementById("export-columns-input");

    let map = null;
    let tiles = null;
    let source = null;
    let worker = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let numCols = 0;
    let numRows = 0;
    let tileWidth = 0;
    let tileHeight = 0;
    let extractedTilesWidth = 0;
    let extractedTilesHeight = 0;

    function reset() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
        map = null;
        tiles = null;
        consoleLayer.innerHTML = "";
        tilesLayer.innerHTML = "";
        tilesetLayer.innerHTML = "";
        progress.value = 0;
        resultLayer.setAttribute("hidden", "");
        processButton.disabled = true;
    }

    function fullReset() {
        reset();
        source = null;
        sourceWidth = 0;
        sourceHeight = 0;
        numCols = 0;
        numRows = 0;
        tileWidth = 0;
        tileHeight = 0;
        extractedTilesWidth = 0;
        extractedTilesHeight = 0;
        processButton.disabled = true;
    }

    function log(header, content) {
        const line = document.createElement("p");
        line.setAttribute("fine", "");
        const spanHeader = document.createElement("span");
        spanHeader.textContent = header;
        const spanContent = document.createElement("span");
        spanContent.textContent = content;
        line.appendChild(spanHeader);
        line.appendChild(spanContent);
        consoleLayer.appendChild(line);
    }

    function error(msg) {
        const line = document.createElement("p");
        line.setAttribute("error", "");
        line.textContent = msg;
        consoleLayer.appendChild(line);
    }

    function checkSourceSize() {
        if (0 === numCols || numCols !== Math.floor(numCols)) {
            error("image-width not dividable by tile-width.");
            return false;
        }
        if (0 === numRows || numRows !== Math.floor(numRows)) {
            error("image-height not dividable by tile-height.");
            return false;
        }
        return true;
    }

    function readUI() {
        tileWidth = tileWidthInput.value | 0;
        tileHeight = tileHeightInput.value | 0;
        if (source) {
            sourceWidth = source.width;
            sourceHeight = source.height;
            numCols = sourceWidth / tileWidth;
            numRows = sourceHeight / tileHeight;
        }
    }

    function loadImage(src) {
        fullReset();
        source = new Image();
        source.src = src;
        source.onload = function () {
            readUI();
            log("Image loaded:", `${source.width} x ${source.height}px`);
            if (checkSourceSize()) {
                processButton.disabled = false;
            } else {
                processButton.disabled = true;
            }
        };
        source.onerror = function () {
            error("Could not load image.");
            processButton.disabled = true;
        };
    }

    function extractSourceData(source) {
        const canvas = document.createElement("canvas");
        canvas.setAttribute("width", source.width);
        canvas.setAttribute("height", source.height);
        const context = canvas.getContext("2d");
        context.drawImage(source, 0, 0, source.width, source.height);
        return context.getImageData(0, 0, source.width, source.height);
    }

    function exportTiledFormat() {
        const xmlMap = document.createElement("map");
        xmlMap.setAttribute("version", "1.0");
        xmlMap.setAttribute("orientation", "orthogonal");
        xmlMap.setAttribute("renderorder", "right-down");
        xmlMap.setAttribute("width", numCols);
        xmlMap.setAttribute("height", numRows);
        xmlMap.setAttribute("tilewidth", tileWidth);
        xmlMap.setAttribute("tileheight", tileHeight);
        xmlMap.setAttribute("nextobjectid", "1");
        const xmlTileSet = document.createElement("tileset");
        xmlTileSet.setAttribute("firstgid", "1");
        xmlTileSet.setAttribute("name", "tiles");
        xmlTileSet.setAttribute("tilewidth", tileWidth);
        xmlTileSet.setAttribute("tileheight", tileHeight);
        xmlTileSet.setAttribute("tilecount", tiles.length);
        const desiredExportColsTMX = parseInt(exportColumnsInput.value, 10) || 8;
        const actualExportColsTMX = Math.min(desiredExportColsTMX, tiles.length);
        xmlTileSet.setAttribute("columns", actualExportColsTMX);
        const xmlImage = document.createElement("image");
        xmlImage.setAttribute("source", "tiles.png");
        xmlImage.setAttribute("width", extractedTilesWidth);
        xmlImage.setAttribute("height", extractedTilesHeight);
        xmlTileSet.appendChild(xmlImage);
        xmlMap.appendChild(xmlTileSet);
        const xmlLayer = document.createElement("layer");
        xmlLayer.setAttribute("id", "1");
        xmlLayer.setAttribute("name", "layer");
        xmlLayer.setAttribute("width", numCols);
        xmlLayer.setAttribute("height", numRows);
        const xmlData = document.createElement("data");
        xmlData.setAttribute("encoding", "csv");

        const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
        const FLIPPED_VERTICALLY_FLAG = 0x40000000;

        const gidArray = [];

        for (let i = 0, n = map.length; i < n; ++i) {
            const mapEntry = map[i];
            const baseGid = mapEntry.index + 1;
            let finalGid = baseGid;

            switch (mapEntry.orientation) {
                case 'hflip':
                    finalGid |= FLIPPED_HORIZONTALLY_FLAG;
                    break;
                case 'vflip':
                    finalGid |= FLIPPED_VERTICALLY_FLAG;
                    break;
                case 'hvflip':
                    finalGid |= FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG;
                    break;
            }

            const unsignedGid = finalGid >>> 0;

            gidArray.push(unsignedGid);
        }

        xmlData.textContent = gidArray.join(',');

        xmlLayer.appendChild(xmlData);
        xmlMap.appendChild(xmlLayer);

        const desiredExportCols = parseInt(exportColumnsInput.value, 10) || 8;
        const actualExportCols = Math.min(desiredExportCols, tiles.length);

        console.log("TMX Export Debug:");
        console.log(" - Map Dims:", numCols, "x", numRows);
        console.log(" - Tile Dims:", tileWidth, "x", tileHeight);
        console.log(" - Tileset: tilecount=", tiles.length, "columns=", actualExportCols);
        console.log(" - Tileset Image Dims:", extractedTilesWidth, "x", extractedTilesHeight);
        console.log(" - Layer Dims:", numCols, "x", numRows);
        console.log(" - CSV Data (first 100 chars):", gidArray.join(',').substring(0, 100), "...");

        return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(xmlMap);
    }

    function beginExtractionWorker() {
        reset();
        processButton.disabled = true;

        readUI();
        if (!checkSourceSize()) {
            processButton.disabled = false;
            return;
        }

        console.log("beginExtractionWorker: Using source:", source ? source.src.substring(0, 100) + '...' : 'null');

        log("Processing started...", "");
        worker = new Worker('tileset-extractor-worker.js');
        worker.onmessage = function (event) {
            const data = event.data;
            const action = data.action;
            if (action === "extract-start") {
                progress.removeAttribute("hidden");
            } else if (action === "extract-progress") {
                progress.value = Math.min(data.progress, 1.0);
            } else if (action === "extract-result") {
                progress.setAttribute("hidden", "");
                resultLayer.removeAttribute("hidden");
                map = data.map;
                tiles = data.tiles;
                log("Number of tiles:", tiles.length);
                log("Time:", data.time + "ms");
                showExtractedTiles();
                showTileset();

                const exportMap = map.map(entry => {
                    if (entry.orientation === 'normal') {
                        return { index: entry.index };
                    }
                    return entry;
                });

                downloadMapLink.download = "map.json";
                downloadMapLink.href = window.URL.createObjectURL(new Blob([JSON.stringify({
                    map: exportMap,
                    numCols: numCols,
                    numRows: numRows
                })], { type: 'text/plain' }));
                downloadTiledTMXLink.download = "tiled.tmx";
                downloadTiledTMXLink.href = window.URL.createObjectURL(new Blob([exportTiledFormat()], { type: 'text/xml' }));

                processButton.disabled = false;
            }
        };
        worker.onerror = function (e) {
            error("Worker error: " + e.message);
            progress.setAttribute("hidden", "");
            processButton.disabled = false;
            worker = null;
        };

        const allowFlipping = allowFlippingCheckbox.checked;
        const imageData = extractSourceData(source);
        console.log("beginExtractionWorker: Extracted imageData dimensions:", imageData.width, "x", imageData.height);

        worker.postMessage({
            action: "extract",
            tileWidth: tileWidth,
            tileHeight: tileHeight,
            tolerance: toleranceInput.value * 1024,
            imageData: imageData,
            allowFlipping: allowFlipping
        });
    }

    function showExtractedTiles() {
        for (let i = 0, n = tiles.length; i < n; ++i) {
            const canvas = document.createElement("canvas");
            canvas.setAttribute("width", tileWidth.toString());
            canvas.setAttribute("height", tileHeight.toString());
            canvas.getContext("2d").putImageData(tiles[i], 0, 0);
            tilesLayer.appendChild(canvas);
        }
        downloadTilesLink.href = createTilesDataURL();
        downloadTilesLink.download = "tiles.png";
    }

    function showTileset() {
        const canvas = document.createElement('canvas');
        canvas.setAttribute("width", sourceWidth.toString());
        canvas.setAttribute("height", sourceHeight.toString());
        const context = canvas.getContext('2d');
        let index = 0;
        for (let y = 0; y < numRows; ++y) {
            for (let x = 0; x < numCols; ++x) {
                const mapEntry = map[index++];
                const tileIndex = mapEntry.index;
                const orientation = mapEntry.orientation;
                const tile = tiles[tileIndex];

                if (!tile) {
                    console.error(`Tile not found for index: ${tileIndex} at map pos ${x},${y}`);
                    continue;
                }

                const drawX = x * tileWidth;
                const drawY = y * tileHeight;

                context.save();

                let scaleH = 1, scaleV = 1;
                if (orientation === 'hflip' || orientation === 'hvflip') {
                    scaleH = -1;
                }
                if (orientation === 'vflip' || orientation === 'hvflip') {
                    scaleV = -1;
                }

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tileWidth;
                tempCanvas.height = tileHeight;
                tempCanvas.getContext('2d').putImageData(tile, 0, 0);

                if (scaleH === -1 || scaleV === -1) {
                    context.translate(drawX + tileWidth / 2, drawY + tileHeight / 2);
                    context.scale(scaleH, scaleV);
                    context.drawImage(tempCanvas, -tileWidth / 2, -tileHeight / 2);
                } else {
                    context.drawImage(tempCanvas, drawX, drawY);
                }

                context.restore();
            }
        }
        tilesetLayer.appendChild(canvas);
        downloadTileMapLink.href = canvas.toDataURL();
        downloadTileMapLink.download = "tilemap.png";
    }

    function createTilesDataURL() {
        const numTiles = tiles.length;
        const desiredCols = parseInt(exportColumnsInput.value, 10) || 8;
        const numCols = Math.min(desiredCols, numTiles);
        const numRows = (numTiles > 0) ? Math.ceil(numTiles / numCols) : 1;
        
        extractedTilesWidth = numCols * tileWidth;
        extractedTilesHeight = numRows * tileHeight;
        const canvas = document.createElement("canvas");
        canvas.setAttribute("width", (extractedTilesWidth).toString());
        canvas.setAttribute("height", (extractedTilesHeight).toString());
        const context = canvas.getContext('2d');
        for (let i = 0; i < numTiles; ++i) {
            const col = i % numCols;
            const row = Math.floor(i / numCols);
            const x = col * tileWidth;
            const y = row * tileHeight;
            context.putImageData(tiles[i], x, y);
        }
        return canvas.toDataURL();
    }

    choose.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) {
            error("No file selected.");
            return;
        }
        if (!file.type.match('image/png') && !file.type.match('image/gif')) {
            error("File must be png or gif.");
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            loadImage(e.target.result);
        };
        reader.readAsDataURL(file);

        e.target.value = null;
    });
    loadDemoButton.addEventListener("click", function () {
        loadImage('tileset-extractor-demo.png');
    });
    loadDemoBigButton.addEventListener("click", function () {
        loadImage('tileset-extractor-demo-big.png');
    });
    processButton.addEventListener('click', function() {
        if (source) {
            beginExtractionWorker();
        } else {
            error("No image loaded to process.");
        }
    });
    [tileWidthInput, tileHeightInput].forEach(input => {
        input.addEventListener('change', () => {
            readUI();
            if (source) {
                if (!checkSourceSize()) {
                    processButton.disabled = true;
                } else {
                    processButton.disabled = false;
                }
            } else {
                processButton.disabled = true;
            }
        });
    });

    // Add listener to update downloads when export columns change
    exportColumnsInput.addEventListener('change', () => {
        if (tiles && tiles.length > 0) { // Only update if results exist
            // Regenerate tiles.png with new column count
            downloadTilesLink.href = createTilesDataURL(); 
            // Regenerate tiled.tmx with new column count
            downloadTiledTMXLink.href = window.URL.createObjectURL(new Blob([exportTiledFormat()], { type: 'text/xml' }));
            // Note: The visual tile display in div[tiles] does not need to change, 
            // only the downloaded tiles.png layout.
        }
    });
}