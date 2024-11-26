const fs = require('fs');
const xml2js = require('xml2js');
const got = require('got');
const { createWriteStream } = require("fs");

const kmlFilename = 'zsm.kml';                              // KML file name
var openAirData = '';                                       // OpenAir data to be written to file

// Get URL from command line parameters
const kmlUrl = process.argv[2];
const outputFilename = process.argv[3];


DownloadKML();

// Download KML file from URL
function DownloadKML() {
  const downloadStream = got.stream(kmlUrl);
  const fileWriterStream = createWriteStream(kmlFilename);

  downloadStream
  .on("downloadProgress", ({ transferred, total, percent }) => {
    const percentage = Math.round(percent * 100);
    console.error(`progress: ${transferred}/${total} (${percentage}%)`);
  })
  .on("error", (error) => {
    console.error(`Download failed: ${error.message}`);
  });

fileWriterStream
  .on("error", (error) => {
    console.error(`Could not write file to system: ${error.message}`);
  })
  .on("finish", () => {
    console.log(`File downloaded to ${kmlFilename}`);
    ReadAndProcess();
  });

downloadStream.pipe(fileWriterStream);
}



function ReadAndProcess() {
  fs.readFile(kmlFilename, 'utf8', (err, data) => {
    if (err) throw err;
  
    xml2js.parseString(data, (err, result) => {
      if (err) throw err;

      // Get Schema name with date
      var schemaUrl = result.kml.Document[0].Schema[0].$.id;
      openAirData += `* Date=${schemaUrl}`;

      // --- Extract data from KML file ---
      result.kml.Document[0].Folder[0].Placemark.forEach(element => {
        // Get Comment
        var comment = element.ExtendedData[0].SchemaData[0].SimpleData[1]._;
        comment = comment.replace(/\r?\n|\r/g, ''); // Remove new lines

        // Get Max altitude for the zone
        var altData = element.ExtendedData[0].SchemaData[0].SimpleData[15];
        var maxElement = element.ExtendedData[0].SchemaData[0].SimpleData.find(data => data.$.name === '_max');
        var altMaxZone = maxElement._;
        altMaxZone = parseInt(altMaxZone, 10);        // Convert to integer without decimals
        altMaxZone = Math.floor(altMaxZone * 0.3048); // Convert to meters and suppress decimal part
        altMaxZone += 300;                            // Add 300m to altitude of highest point
    
        openAirData += sectionHeader(comment);

        // Write Altitude
        openAirData += `AH ${altMaxZone}m AMSL\n`;
        openAirData += 'AL GND\n';

        // Get Coordinates
        var coordinates = element.MultiGeometry[0].Polygon[0].outerBoundaryIs[0].LinearRing[0].coordinates[0];
        coordinates = coordinates.split(' ').map(coordinate => {
          const [lon, lat] = coordinate.split(',');
          return [parseFloat(lon), parseFloat(lat)];
        });
  
        var startOfPolygon;
  
        for (let i = 0; i <= coordinates.length - 2; i += 2) {
          const lon = coordinates[i][0];
          const lat = coordinates[i + 1][1];
  
          // Convert decimal degrees to degrees minutes seconds
          const lonDMS = ConvertDDToDMS(lon, true);
          const latDMS = ConvertDDToDMS(lat, false);
  
          // Populate OpenAir data
          var dpEntry = `DP ${latDMS} ${lonDMS}\n`;
          openAirData += dpEntry
           
          if (i === 0) {
            startOfPolygon = dpEntry;
          }
        }
        openAirData += startOfPolygon
      });
  
      // Write the OpenAir data to a file
      fs.writeFile(outputFilename, openAirData, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });
    });
  });
}


// Function to convert decimal degrees to degrees minutes seconds
function ConvertDDToDMS(deg, lng) {

  var d = parseInt(deg.toString());
  var minfloat = Math.abs((deg - d) * 60);
  var m = Math.floor(minfloat);
  var secfloat = (minfloat - m) * 60;
  var s = Math.round((secfloat + Number.EPSILON) * 100) / 100;
  s = Math.floor(s);                                              // Do not keep decimal places for seconds
  d = Math.abs(d);

  if (s == 60) {
    m++;
    s = 0;
  }
  if (m == 60) {
    d++;
    m = 0;
  }

  let dms = {
    dir: deg < 0 ? lng ? 'W' : 'S' : lng ? 'E' : 'N',
    deg: d,
    min: m,
    sec: s
  };

  // Add leading zeros to minutes and seconds
  const degreesStr = dms.deg < 10 ? `00${dms.deg}` : dms.deg;
  const minutesStr = dms.min < 10 ? `0${dms.min}` : dms.min;
  const secondsStr = dms.sec < 10 ? `0${dms.sec}` : dms.sec;

  return `${degreesStr}:${minutesStr}:${secondsStr} ${dms.dir}`;
};

// Create OpenAir section Header
function sectionHeader(sectionDescription) {
  return `\n\n**ZONE SENSIBILITE MAXIMUM**\n**Site ZSM Gypaete  Bird Protection Tampon**\nAC UNCLASSIFIED\nAY P\nAN ${sectionDescription}\n`;
}
