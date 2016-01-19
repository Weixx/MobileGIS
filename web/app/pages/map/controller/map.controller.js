/**
 * Created by Christoph on 12.11.2015.
 */

define('Map', [
    "jquery",
    "jqueryMobile",
    "Overpass",
    "Database",
    "MarkerManager",
    "Bootstrap"
], function ($, jqm, Overpass, Database, MarkerManager) {
    'use strict';

    $(function () {
        console.log("map_controller");

        var view = new ol.View({
            center: ol.proj.transform([0, 0], 'EPSG:4326', 'EPSG:3857'),
            zoom: 4
        });
        var myFormat = function (dgts) {
            return (
                function (coord1) {
                    var coord2 = [coord1[1], coord1[0]];
                    return ol.coordinate.toStringXY(coord2, dgts);
                });
        };
        var mousePositionControl = new ol.control.MousePosition({
            coordinateFormat: myFormat(3),
            projection: 'EPSG:4326',
            undefinedHTML: '&nbsp;',
            target: document.getElementById('mouse-location')
        });
        var map = new ol.Map({
            target: 'olMap',
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.MapQuest({layer: 'osm'})
                }),
                //new ol.layer.Tile({
                //    source: new ol.source.MapQuest({layer: 'sat'})
                //})
            ],
            view: view,
            interactions: ol.interaction.defaults().extend([
                new ol.interaction.DragRotateAndZoom()
            ]),
            controls: ol.control.defaults({
                attributionOptions: /** @type {olx.control.AttributionOptions} */ ({
                    collapsible: false
                })
            }).extend([mousePositionControl])
        });

        var element = document.getElementById('popup');
        var popup = new ol.Overlay({
            element: element
        });
        map.addOverlay(popup);

        map.addEventListener('click', function (event) {
            var coord3857 = event.coordinate;
            var coord4326 = ol.proj.transform(coord3857, 'EPSG:3857', 'EPSG:4326');

            var overpass = new Overpass();
            overpass.bboxset([coord4326[1], coord4326[0], coord4326[1] + 0.001, coord4326[0] + 0.001]);//'48.211,16.357,48.212,16.358');
            var request = overpass.sendRequest();
            request.then(function (data) {
                var markerManager = new MarkerManager();
                var markerOptions = {
                    name: "test",
                    coord: coord3857,
                    data: data,
                    showOnMap: true,
                    target: map
                };

                var marker = markerManager.addMarker(markerOptions);

                $(element).popover('destroy');
                popup.setPosition(coord3857);
                $(element).popover({
                    'placement': 'top',
                    'animation': false,
                    'html': true,
                    'content': createDataTemplate(data, coord4326).outerHTML
                });
                $(element).popover('show');

            });

            //var db = new Database();
            //db.insertObject(request)
        });

        function createDataTemplate(data, coord4326) {
            var dataTemplate = document.createElement("div");
            var p = dataTemplate.appendChild(document.createElement("p"));
            var ul = p.appendChild(document.createElement("ul"));
            for (var key in data) {
                if (data.hasOwnProperty(key)) {
                    var li = ul.appendChild(document.createElement("li"));
                    if (data) {
                        li.innerHTML = key + ": " + data[key];
                    }
                }
            }
            if (data == null) {
                var li = ul.appendChild(document.createElement("li"));
                li.innerHTML = "No Info Available";
            }
            var c = dataTemplate.appendChild(document.createElement("code"));
            c.innerHTML = [coord4326[0].toFixed(6), coord4326[1].toFixed(6)];
            c.id = "coord";
            var form = dataTemplate.appendChild(document.createElement("textArea"));
            form.id = "textArea";

            return dataTemplate;
        }

        // geolocate device
        var locateEnabled = false;
        var firstInit = false;
        $("#info-button").hide();
        var geolocateBtn = document.getElementById('locate-button');
        geolocateBtn.addEventListener('click', function () {
            locateEnabled = !locateEnabled;
            if (locateEnabled) {
                $("#locate-button .ui-btn-text").text("Disable");
                $("#info-button").show();
            } else {
                $("#locate-button .ui-btn-text").text("Locate Me!");
                $("#info-button").hide();
            }

            firstInit = true;
            geolocation.setTracking(locateEnabled); // Start position tracking
        });

        // Geolocation Control
        var geolocation = new ol.Geolocation(/** @type {olx.GeolocationOptions} */ ({
            projection: view.getProjection(),
            trackingOptions: {
                //maximumAge: 10000,
                enableHighAccuracy: true
                //timeout: 600000
            }
        }));

        // Listen to position changes
        geolocation.on('change', function (evt) {
            var position = geolocation.getPosition();
            var altitude = geolocation.getAltitude();
            var altitudeAccuracy = geolocation.getAltitudeAccuracy();
            var accuracy = geolocation.getAccuracy();
            var heading = geolocation.getHeading() || 0;
            var speed = geolocation.getSpeed() || 0;
            var m = Date.now();

            var html = [
                'Position: ' + position[0].toFixed(2) + ', ' + position[1].toFixed(2) + ' [m]',
                'Altitude: ' + altitude + ' [m]',
                'Accuracy: ' + 'xy - ' + accuracy + ', h - ' + altitudeAccuracy + ' [m]',
                'Heading: ' + Math.round(radToDeg(heading)) + '&deg;',
                'Speed: ' + (speed * 3.6).toFixed(1) + ' km/h'
            ].join('<br />');
            document.getElementById('info-button').innerHTML = html;

            if (firstInit) {
                doBounce(position);
            }
            firstInit = false;
        });

        geolocation.on('error', function () {
            alert('geolocation error');
        });

        var accuracyFeature = new ol.Feature();
        geolocation.on('change:accuracyGeometry', function () {
            accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
        });

        var positionFeature = new ol.Feature();
        positionFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({
                    color: '#3399CC'
                }),
                stroke: new ol.style.Stroke({
                    color: '#fff',
                    width: 2
                })
            })
        }));

        geolocation.on('change:position', function () {
            var coordinates = geolocation.getPosition();
            positionFeature.setGeometry(coordinates ?
                new ol.geom.Point(coordinates) : null);
        });

        var featuresOverlay = new ol.layer.Vector({
            map: map,
            source: new ol.source.Vector({
                features: [accuracyFeature, positionFeature]
            })
        });

        function doBounce(location) {
            // bounce by zooming out one level and back in
            var bounce = ol.animation.bounce({
                resolution: map.getView().getResolution() * 2
            });
            // start the pan at the current center of the map
            var pan = ol.animation.pan({
                source: map.getView().getCenter()
            });
            map.beforeRender(bounce);
            map.beforeRender(pan);
            // when we set the center to the new location, the animated move will
            // trigger the bounce and pan effects
            map.getView().setCenter(location);
            map.getView().setZoom(17);
        }

        // convert radians to degrees
        function radToDeg(rad) {
            return rad * 360 / (Math.PI * 2);
        }

        // convert degrees to radians
        function degToRad(deg) {
            return deg * Math.PI * 2 / 360;
        }

        // modulo for negative values
        function mod(n) {
            return ((n % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        }

    });
});
