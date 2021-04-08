const { exec } = require('child_process');
const express = require('express')
const app = express()
const server = require('http').createServer(app);
const WebSocket = require('ws');
const port = 3000;
const request = require('request');
const querystring = require('querystring');
const fetch = require("node-fetch");
const { connect } = require('http2');

app.use(express.static(__dirname + "/views"));
app.use(express.urlencoded({ extended: true }));
const wss = new WebSocket.Server({ server: server });

let servers = ["192.168.0.16", "192.168.0.13"];

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
function enviarHora(ws) {
    wss.clients.forEach(function each(client) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(horaActual());
        }
    });
    setTimeout(function () {
        enviarHora(ws);
    }, 500);
}

function horaActual(valor1, valor2) {
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
    obtenerHoraApi();
    res.send('Sincronizandoo!');
});

function promedio(horaApi) {
    horaApi = horaApi.split(':');
    var fecha = new Date();
    var horaAc = fecha.getHours();
    var minutosAc = fecha.getMinutes();
    var segAc = fecha.getSeconds();
    var promHora = horaApi[0] - horaAc;
    var promMin = horaApi[1] - minutosAc;
    var promSeg = horaApi[2] - segAc;
    var promedioOtrosServidores = promedioAllServers(promHora, promMin, promSeg, horaApi);
    console.log("Promedio de desfase de hora: " + promedioOtrosServidores);
}

function promedioAllServers(promHora, promMin, promSeg, horaApi) {
    servers.forEach(function (elemento) {
        var PromesaActual = await enviarHoraPorIP(elemento, 3001, '/sincronizar', horaApi);
        PromesaActual.then(result => {
            hms = result.split(':');
            promHora += horaApi[0] - hms[0];
            promMin += horaApi[1] - hms[1];
            promSeg += horaApi[2] - hms[2];
        });
        PromesaActual.catch(rechazar => {
            console.log('Error al conectar a la ip: ' + elemento);
        });
    });
    promHora = promHora / servers.length;
    promMin = promMin / servers.length;
    promSeg = promSeg / servers.length;
    return promHora + ":" + promMin + ":" + promSeg);
}

/**
 * Obtiene primero los datos de la hora actual y luego
 * llama al metodo berkely
 */
function obtenerHoraApi() {
    var promesa = new Promise((resolver, rechazar) => {
        console.log('Inicial');
        fetch('http://worldtimeapi.org/api/timezone/America/Bogota')
            .then(function (response) {
                return response.json(); // converts response to json
            })
            .then(function (data) {
                resolver(data["datetime"].substr(11, 8));
            });
    });
    promesa.then(result => {
        console.log("Se obtuvo la hora de la API: " + result);
        promedio(result);
    });
    promesa.catch(rechazar => {
        console.log("Se rechazo la promesa, No se puedo obtener hora de la API: " + rechazar);
    });
}

/**
 * Usa la ip por parametro para heacer una peticion
 */

function enviarHoraPorIP(ip, puerto, path, hora) {
    return new Promise((resolver, rechazar) => {
        hora = hora + '';
        var horaMinSeg = hora.split(':');
        var data = querystring.stringify({
            'Hora': horaMinSeg[0],
            'Minuto': horaMinSeg[1],
            'Segundo': horaMinSeg[2]
        });
        var http = require('http');
        var post_options = {
            host: ip,
            port: puerto,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        //Abro la coneccion
        var post_req = http.request(post_options, function (res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                console.log('Response: ' + chunk);
                resolver(chunk);
            });
        });
        //En caso de error
        post_req.on('error', function (error) {
            console.log("No se pudo conectar con: " + ip + " puerto: " + puerto);
            //Elimino la ip de la lista de servidores
            servers.splice(servers.indexOf(ip), 1);
            rechazar("No se pudo conectar con: " + ip + " puerto: " + puerto);
        });
        //Envio los datos
        post_req.write(data);
        post_req.end();
    });
}

app.get('/', (req, res) => res.send('Hello World!'));

server.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});