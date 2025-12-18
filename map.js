var Init;
require([
    "esri/Map",
    "esri/WebMap",
    "esri/views/SceneView",
    "esri/widgets/BasemapGallery",
    "esri/layers/FeatureLayer",
    "esri/layers/ElevationLayer",
    "esri/layers/GraphicsLayer",

    "esri/layers/BaseElevationLayer",
    "esri/widgets/Sketch/SketchViewModel",
    "esri/geometry/geometryEngineAsync",
    "esri/geometry/support/webMercatorUtils",
    "dojo/domReady!"
], function (Map, WebMap, SceneView, BasemapGallery, FeatureLayer, ElevationLayer, GraphicsLayer, BaseElevationLayer, SketchViewModel, geometryEngineAsync, webMercatorUtils) {
    $(document).ready(function () {
        Init = (function () {
            const initMap = function () {
                var ExaggeratedElevationLayer = BaseElevationLayer.createSubclass({
                    properties: {
                        exaggeration: 2
                    },
                    load: function () {
                        this._elevation = new ElevationLayer({
                            url: "//elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer"
                        });

                        this.addResolvingPromise(this._elevation.load());
                    },

                    fetchTile: function (level, row, col, options) {
                        return this._elevation.fetchTile(level, row, col, options).then(
                            function (data) {
                                var exaggeration = this.exaggeration;
                                for (var i = 0; i < data.values.length; i++) {
                                    data.values[i] = data.values[i] * exaggeration;
                                }
                                return data;
                            }.bind(this)
                        );
                    }
                });


                var map = new Map({
                    basemap: "hybrid",
                    ground: "world-elevation",
                    layers: [],
                    
                });

                var view = new SceneView({
                    container: "viewDiv",
                    viewingMode: "global",
                    map: map,
                    camera: {
                        position: {
                            x: -105.5012,
                            y: 44.17,
                            z: 15000000,
                            spatialReference: {
                                wkid: 4326

                            }
                        },
                        heading: 0,
                        tilt: 0
                    },
                    popup: {
                        dockEnabled: true,
                        dockOptions: {
                            breakpoint: false
                        }
                    },
                    // enable shadows to be cast from the features
                    environment: {
                        lighting: {
                            directShadowsEnabled: false
                        }
                    }
                })
                // Graphics layer to hold the drawn query rectangle
                var polygonGraphicsLayer = new GraphicsLayer();
                map.add(polygonGraphicsLayer);

                // Sketch model used to draw rectangles
                const sketchViewModel = new SketchViewModel({
                    view: view,
                    layer: polygonGraphicsLayer
                });

                // --- UI wiring ---
                // Place the toolbar INTO the ArcGIS view UI so it won't cover (or be covered by)
                // the default ArcGIS controls.
                const toolBar = document.getElementById("toolBar");
                if (toolBar) {
                    try { toolBar.classList.add("esri-widget"); } catch (e) {}
                    // If the element is hidden in the DOM to avoid layout issues, unhide it now.
                    try { toolBar.style.display = "flex"; } catch (e) {}
                    // Bottom-left keeps it out of the way of default nav buttons
                    // and out from under the right-hand results drawer.
                    view.ui.add(toolBar, { position: "bottom-left", index: 0 });
                }

                const selectButton = document.getElementById("select-by-rectangle");
                const clearButton = document.getElementById("clear-selection");
                const imageEl = document.getElementById("image");
                const wikiEl = document.getElementById("wiki");
                const sidePanel = document.getElementById("sidePanel");
                const sidePanelClose = document.getElementById("sidePanelClose");

                const openPanel = () => {
                    if (sidePanel) sidePanel.style.display = "block";
                };
                const closePanel = () => {
                    if (sidePanel) sidePanel.style.display = "none";
                };

                if (sidePanelClose) {
                    sidePanelClose.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        closePanel();
                    });
                }

                let isDrawing = false;
                const setDrawingState = (on) => {
                    isDrawing = on;
                    if (selectButton) {
                        if (on) selectButton.classList.add("is-active");
                        else selectButton.classList.remove("is-active");
                    }
                };

                const clearResults = () => {
                    polygonGraphicsLayer.removeAll();
                    if (wikiEl) wikiEl.innerHTML = "";
                    if (imageEl) {
                        imageEl.classList.add("placeholder");
                        imageEl.innerHTML = "No photo yet. Click <strong>Draw box</strong>, draw an area on the map, and we’ll try to find a random Wikimedia Commons image inside it.";
                    }
                    closePanel();
                };

                if (selectButton) {
                    selectButton.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        view.popup.close();

                        // Toggle behavior: clicking again cancels draw mode.
                        if (isDrawing) {
                            try { sketchViewModel.cancel(); } catch (err) { }
                            setDrawingState(false);
                            return;
                        }

                        // Ensure we ONLY enter draw mode from this button.
                        // If a previous draw is still active, cancel it first.
                        try { sketchViewModel.cancel(); } catch (err) { }

                        polygonGraphicsLayer.removeAll();
                        setDrawingState(true);
                        sketchViewModel.create("rectangle");
                    });
                }

                if (clearButton) {
                    clearButton.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try { sketchViewModel.cancel(); } catch (err) { }
                        setDrawingState(false);
                        clearResults();
                    });
                }

                // ESC cancels drawing
                view.on("key-down", function (event) {
                    if (event.key === "Escape") {
                        try { sketchViewModel.cancel(); } catch (err) { }
                        setDrawingState(false);
                    }
                });

                var tries = 0

                // Once user is done drawing a rectangle on the map
                // use the rectangle to select features on the map and table
                sketchViewModel.on("create", async (event) => {
                    if (event.state === "start") {
                        setDrawingState(true);
                    }

                    if (event.state === "cancel") {
                        setDrawingState(false);
                        return;
                    }

                    if (event.state === "complete") {
                        setDrawingState(false);
                        const geometries = polygonGraphicsLayer.graphics.map(function (graphic) {
                            return graphic.geometry
                        });
                        console.log(geometries.toArray())
                        var latMax = geometries.toArray()[0].extent.ymax
                        var lonMax = geometries.toArray()[0].extent.xmax
                        var latMin = geometries.toArray()[0].extent.ymin
                        var lonMin = geometries.toArray()[0].extent.xmin
                        console.log(webMercatorUtils.xyToLngLat(lonMax, latMax))
                        function getRandomInRange(from, to, fixed) {
                            return (Math.random() * (to - from) + from).toFixed(fixed) * 1;
                            // .toFixed() returns string, so ' * 1' is a trick to convert to number
                        }
                        function getImage() {
                            tries++
                            if (tries > 19) {
                                alert('Could not find image after ' + tries.toString() + ' tries. Please try a different area')
                                // Also show a message in the results panel
                                openPanel();
                                if (wikiEl) wikiEl.innerHTML = "";
                                if (imageEl) {
                                    imageEl.classList.add("placeholder");
                                    imageEl.textContent = "No image found for that area. Try drawing a smaller box or a different location.";
                                }
                                tries = 0
                                return;
                            }
                            var lon = getRandomInRange(webMercatorUtils.xyToLngLat(lonMin, latMin)[0], webMercatorUtils.xyToLngLat(lonMax, latMax)[0], 3)
                            var lat = getRandomInRange(webMercatorUtils.xyToLngLat(lonMin, latMin)[1], webMercatorUtils.xyToLngLat(lonMax, latMax)[1], 3)
                            var url = "https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggsprimary=all&ggsnamespace=6&ggsradius=10000&ggscoord=" + lat + "|" + lon + "&ggslimit=1&prop=imageinfo&iilimit=1&iiprop=url&iiurlwidth=200&iiurlheight=200&format=json&origin=*"
                           //ajax gives instructions on what to show from the API
                            $.ajax({url:url,
                                type: 'GET',
                                dataType: 'json',
                                    xhrFields: {withCredentials: false},
                                success: function(data){
                                    console.log(data)
                                    if (!data.query) {
                                        getImage()
                                    }
                                else {
                                    console.log(data)
                                    var pageid = Object.keys(data.query.pages)
                                    var name = data.query.pages[pageid].title
                                    console.log(name)
                                    if (name.indexOf("View of")>0) {
                                        console.log('space photo')
                                    }
                                    else {
                                        console.log('not space photo')
                                        // Open the right-hand drawer when we have a result
                                        openPanel();
                                        // Update right-side panel
                                        if (imageEl) {
                                            imageEl.classList.remove("placeholder");
                                            imageEl.textContent = name;
                                        }

                                        if (wikiEl) {
                                            const imgUrl = data.query.pages[pageid].imageinfo[0].url;
                                            wikiEl.innerHTML = "";
                                            const img = document.createElement("img");
                                            img.className = "result-img";
                                            img.src = imgUrl;
                                            img.alt = name;
                                            wikiEl.appendChild(img);
                                        }

                                        // On small screens, ensure the result panel is visible
                                        if (sidePanel && window.innerWidth <= 900) {
                                            try { sidePanel.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (err) { }
                                        }

                                        var minlat = webMercatorUtils.xyToLngLat(lonMin, latMin)[1]
                                        var minlon = webMercatorUtils.xyToLngLat(lonMin, latMin)[0]
                                        var maxlat = webMercatorUtils.xyToLngLat(lonMax, latMax)[1]
                                        var maxlon = webMercatorUtils.xyToLngLat(lonMax, latMax)[0]
                                    }
                                    }          
                                    }
                                    });
                        
                        }
                        getImage()
                        tries = 0
                    }
                });
            }
            initMap()
            return {
                initMap: initMap
            }
        })();
    })
});
