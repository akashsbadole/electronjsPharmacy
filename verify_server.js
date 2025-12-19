const { spawn } = require('child_process');
const server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: 3001, NODE_ENV: 'dev' }
});

server.stdout.on('data', (data) => {
    console.log(`STDOUT: ${data}`);
    if (data.toString().includes('Listening on PORT')) {
        console.log('Server started successfully');
        process.exit(0);
    }
});

server.stderr.on('data', (data) => {
    console.error(`STDERR: ${data}`);
});

setTimeout(() => {
    console.error('Server timed out');
    process.exit(1);
}, 10000);
