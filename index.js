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
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
const wss = new WebSocket.Server({ server: server });

let servers = ["192.168.0.16", "192.168.0.13"];
let desfases = ["","" ,""];

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
    var promHora = parseInt(horaApi[0] - horaAc);
    var promMin = parseInt(horaApi[1] - minutosAc);
    var promSeg = parseInt(horaApi[2] - segAc);
    desfases[0] = promHora + ":" + promMin + ":" + promSeg;
    promedioAllServers(promHora, promMin, promSeg, horaApi);
}

async function promedioAllServers(promHora, promMin, promSeg, horaApi) {
    for (let i = 0; i < servers.length; i++) {
        var current = await enviarHoraPorIP(servers[i], 3001, '/sincronizar', horaApi);
        desfases[i + 1] = current;
        hms = current.split(':');
        promHora += parseInt(hms[0]);
        promMin += parseInt(hms[1]);
        promSeg += parseInt(hms[2]);
        console.log('Promedio actual: ' + promHora + ':' + promMin + ':' + promSeg);
    }
    promHora = promHora / servers.length;
    promMin = promMin / servers.length;
    promSeg = promSeg / servers.length;
    promedioTotal = promHora + ":" + promMin + ":" + promSeg;
    console.log("La promesa esta lista con: " + promedioTotal);
    cambiarEnTodosLosServidores(promedioTotal);
}

async function cambiarEnTodosLosServidores(promedioHora){
    promedioHora = promedioHora.split(':');
    cambiaAqui(promedioHora);
    for (let i = 0; i < servers.length; i++) {
        //Aqui se podria mostrar en pantalla lo que se hizo
        var des = desfases[ i + 1].split(":");
        await enviarHoraPorIP(servers[i], 3001, '/cambiarHoraDesfase', + promedio[0] - des[0] + ':' 
        + promedio[1] - des[1] + ':' + promedio[1] - des[1]);
        console.log('Cambiando hora en todos los servidores');
    }
}

function cambiaAqui(promedio){
    var des = desfases[0].split(":");
    var childProcess = exec('sh /home/serverone/RelojMiddleware/Shell/cambiarHora.sh '
        + promedio[0] - des[0] + ':' + promedio[1] - des[1] + ':' + promedio[1] - des[1]);
    childProcess.stderr.on('data', data => console.error(data));
    childProcess.stdout.on('data', data => console.log(data));
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
 * Se usa para obtener los desfases y cambiar la hora
 */
function enviarHoraPorIP(ip, puerto, path, hora) {
    return new Promise((resolver, rechazar) => {
        var data = querystring.stringify({
            'Hora': hora[0],
            'Minuto': hora[1],
            'Segundo': hora[2]
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