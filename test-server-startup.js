const { spawn } = require('child_process');
const path = require('path');

console.log('Testing server startup...');

const serverProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: 'pipe'
});

let output = '';
let errorOutput = '';

serverProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log('Server output:', text);
  
  // Check if server started successfully
  if (text.includes('Server started successfully') || text.includes('Listening on PORT')) {
    console.log('✅ Server started successfully!');
    
    // Extract port if available
    const portMatch = text.match(/PORT\s+(\d+)/);
    if (portMatch) {
      console.log(`Server is running on port: ${portMatch[1]}`);
    }
    
    // Kill the server after successful start
    setTimeout(() => {
      serverProcess.kill();
      console.log('Server process terminated');
    }, 1000);
  }
});

serverProcess.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  console.error('Server error:', text);
});

serverProcess.on('close', (code) => {
  console.log(`Server process exited with code: ${code}`);
  
  if (code !== 0) {
    console.error('❌ Server failed to start');
    console.error('Error output:', errorOutput);
  } else {
    console.log('✅ Server test completed');
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!serverProcess.killed) {
    console.log('⏰ Timeout reached, terminating server...');
    serverProcess.kill();
  }
}, 10000);