const fs = require('fs');
const xml2js = require('xml2js');
const got = require('got');
const { createWriteStream } = require("fs");

const kmlFilename = 'zsm.kml';                              // KML file name
var openAirData = '';                                       // OpenAir data to be written to file

// Get URL from command line parameters
const kmlUrl = process.argv[2];


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
    ReadandProcess();
  });

downloadStream.pipe(fileWriterStream);
}



function ReadandProcess() {
  fs.readFile(kmlFilename, 'utf8', (err, data) => {
    if (err) throw err;
  
    xml2js.parseString(data, (err, result) => {
      if (err) throw err;
  
      // --- Extract data from KML file ---
      result.kml.Document[0].Folder[0].Placemark.forEach(element => {
        // Get Comment
        var comment = element.ExtendedData[0].SchemaData[0].SimpleData[1]._;
        comment = comment.replace(/\r?\n|\r/g, ''); // Remove new lines
  
        openAirData += sectionHeader(comment);
  
        // Get Coordinates
        var coordinates = element.Polygon[0].outerBoundaryIs[0].LinearRing[0].coordinates[0];
        coordinates = coordinates.split(' ').map(coordinate => {
          const [lon, lat] = coordinate.split(',');
          return [parseFloat(lon), parseFloat(lat)];
        });
  
        var startOfPolygon;
  
        for (let i = 0; i <= coordinates.length - 2; i += 2) {
          const lon = coordinates[i][0];
          const lat = coordinates[i + 1][1];
  
          // Convert decimal degrees to degrees minutes seconds
          const lonDMS = convertToDMS(lon, false);
          const latDMS = convertToDMS(lat, true);
  
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
      fs.writeFile('output.txt', openAirData, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });
    });
  });
}


// Function to convert decimal degrees to degrees minutes seconds
function convertToDMS(decimalDegrees, isLatitude = true) {
  var degrees = Math.floor(decimalDegrees);
  const minutes = Math.floor((decimalDegrees - degrees) * 60);
  const seconds = Math.round(((decimalDegrees - degrees) * 60 - minutes) * 60);

  var direction = isLatitude ? 'N' : 'E';
  if (degrees < 0) {
    direction = isLatitude ? 'S' : 'W';
    degrees = Math.abs(degrees);
  }

  // Add leading zeros to minutes and seconds
  const degreesStr = degrees < 10 ? `00${degrees}` : degrees;
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  const secondsStr = seconds < 10 ? `0${seconds}` : seconds;


  return `${degreesStr}:${minutesStr}:${secondsStr} ${direction}`;
}

// Create OpenAir section Header
function sectionHeader(sectionDescription) {
  return `\n\n**ZONE SENSIBILITE MAXIMUM**\n**Site ZSM Gypaete  Bird Protection Tampon**\nAC UNCLASSIFIED\nAY P\nAN ${sectionDescription}\nAH 600m AGL\nAL GND\n`;
}
