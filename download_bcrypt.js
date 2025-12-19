const https = require('https');
const fs = require('fs');

const url = 'https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js';
const file = fs.createWriteStream('bcryptjs.js');

https.get(url, function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close();
    console.log('Download completed');
    fs.writeFileSync('download_status.txt', 'COMPLETED');
  });
}).on('error', function(err) {
  fs.unlink('bcryptjs.js');
  fs.writeFileSync('download_status.txt', 'ERROR: ' + err.message);
});
