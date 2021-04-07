const { exec } = require('child_process');
const express = require('express')
const app = express()
const server = require('http').createServer(app);
const WebSocket = require('ws');
const port = 3000;
const request = require('request');
const querystring = require('querystring');
const fetch = require("node-fetch");

app.use(express.static(__dirname + "/views"));
app.use(express.urlencoded({ extended: true}));
const wss = new WebSocket.Server({ server:server });

let servers = ["192.168.0.16", "Banana"];

wss.on('connection', function connection(ws) {
    console.log('A new client Connected!');
    ws.send('Welcome New Client!');
    enviarHora();
});

/**
 * Cambia la hora segun peticion del ususario
 */
app.post('/cambiarHora', (req, res) => {
    console.log(req.body.hora);
    console.log(req.body.minuto);
    console.log(req.body.segundo);
    var childProcess = exec('sh /home/serverone/RelojMiddleware/Shell/cambiarHora.sh ' 
    + req.body.hora + ':' + req.body.minuto + ':' + req.body.segundo);
    childProcess.stderr.on('data', data => console.error(data));
    childProcess.stdout.on('data', data => console.log(data));
    res.send('Se cambio la hora');
});

/**
 * Envia la hora a cada uno de los clientes conectados
 * @param {*} ws 
 */
function enviarHora(ws){
    wss.clients.forEach(function each(client) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(horaActual());
        }
    });
    setTimeout(function(){
        enviarHora(ws);
    } , 500);
}

function horaActual(valor1,valor2){ 
    var fecha = new Date();
    var hora = fecha.getHours();
    var minutos = fecha.getMinutes();
    var seg = fecha.getSeconds();
    return hora + " : " + minutos + " : " + seg; 
}

/**
 * Opcion hecha solamente para el usuario
 */
app.get('/sincronizar', (req, res) => {
    enviarHoraALaIp("localhost" , "3001");
    res.send('Sincronizandoo!');
});

function enviarHoraALaIp(ip , puerto){
    var promesa = new Promise((resolver, rechazar) => {
        console.log('Inicial');
        fetch('http://worldtimeapi.org/api/timezone/America/Bogota')
        .then(function(response) {
            return response.json(); // converts response to json
        })
        .then(function(data) {
            resolver(data["datetime"].substr(11 , 8));
        });
    });
    promesa.then(result =>{
        console.log("Se obtuvo la hora de la API: " + result);
        enviarHoraPorIP(ip , puerto, result);
    }).catch(() => {
        console.log('No se puedo obtener hora de la API');
    });
}

/**
 * Usa la iip por parametro para heacer una peticion
 */

function enviarHoraPorIP(ip , puerto , hora){
    var horaMinSeg = hora.split(':');
    var data = querystring.stringify({
        'Hora' : horaMinSeg[0],
        'Minuto': horaMinSeg[1],
        'Segundo': horaMinSeg[2]
    });
    var http = require('http');
    var post_options = {
        host: ip,
        port: puerto,
        path: '/sincronizar',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(data)
    }
};

// Set up the request
var post_req = http.request(post_options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
        console.log('Response: ' + chunk);
    });
});

// post the data
post_req.write(data);
post_req.end();
}
  


/**
 * Suma uno a la variable number
 */
 function sum(){
    number++
    if(number >= servers.length){
      number = 0;
    }
  }


app.get('/', (req, res) => res.send('Hello World!'));

server.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});