import { mqtturl, deconzIP, APIkey} from '../index'
import http = require('http');
import { EventEmitter } from 'events';
import WebSocket = require('ws');
import mqttlib = require('mqtt');

import {LightState, lightsFactory, groupsFactory, AbstractOnOffOutlet} from './lights'
import {sensorsFactory} from './sensors'
import { Logger } from "tslog";

export interface deconzEvent {
    payload: any
    id: string
}

export interface lightStateEvent {
    state: LightState
}

export interface deconzLightEvent {
    payload: lightStateEvent
    id: string
}

/**
 * Switches first OFF state outlet to ON
 * @param {AbstractOnOffOutlet[]} outlets  A list of outlets in question
 */
export function switch_first_off_on(outlets: AbstractOnOffOutlet[]) {
    outlets.every((outlet: AbstractOnOffOutlet) => {
        if (outlet.is_on)
            return true;
        outlet.switch_on();
        return false;
    })
}
export function switch_last_on_off(outlets: AbstractOnOffOutlet[]) {
    for(let i=outlets.length; i--; i==0) {
        if (!outlets[i].is_on)
            continue;
        outlets[i].switch_off();
        break;
    }
}

function obj2mqtt(data: any, path: String) {
    var rv=Array();
    if(typeof data === 'number')
        return [[path, String(data)]]
    else if(typeof data === 'string')
        return [[path, data]];
    else for(const key in data) {
        var cpath = path+'/'+key;
        if(Object.prototype.toString.call(data[key])==='[object Object]'){
            if(!(data[key] instanceof Array)||data[key].length!=0){
                if(JSON.stringify(data[key])!=="{}"){
                    rv=rv.concat(obj2mqtt(data[key],cpath));
                }
            }
        } else if (data[key] instanceof Array && data[key].length>0){
            for(const index in data[key]) {
                if(Object.prototype.toString.call(data[key][index])==='[object Object]'){
                    rv=rv.concat(obj2mqtt(data[key][index], cpath+'/'+String(index)));
                } else {
                    rv.push([cpath+'/'+String(index), String(data[key][index])])
                }
            }
        } else {
            rv.push([cpath,String(data[key])]);
        }   
    }   
    
    return rv;
} 

export function entityFactory(deconzIP: string, deconz: DeconzEventEmitter, logger: Logger) {
	return new Promise<void>((resolve, reject) => {
		var options = {
			hostname: deconzIP,
			port: 9181,
			method: 'GET',
			json: true,
			path: `/api/${APIkey}/`
		}

		http.get(options, (res) => {
			var body = "";

			res.on("data", (chunk) => {
				body += chunk;
			});

			res.on("end", async () => {
				var data = await JSON.parse(body);
                logger.info("Creating lights")
				lightsFactory(data.lights, deconz, logger.getChildLogger({ name: "lightsFactory" }));
                logger.info("Creating sensors")
                //FIXME: check if name added
				sensorsFactory(data.sensors, deconz, logger.getChildLogger({ }));
                logger.info("Creating groups")
				groupsFactory(data.groups, deconz, logger.getChildLogger({ name: "groupsFactory" }));
				resolve();
			});

		});
	})
}

class MqttEmitter extends EventEmitter {
    client: mqttlib.MqttClient

    constructor(brokerUrl: string, opts?: mqttlib.IClientOptions) {
        super()
        this.client = mqttlib.connect(brokerUrl, opts)
        this.client.on('message', (path, value) => {
            this.emit(path, String(value))
        });
    }

    on(event: string | symbol, listener: (...args: any[]) => void): this {
//    on(event: string | symbol, listener: Function): this {
        this.client.subscribe(String(event))
        super.on(event, listener)
        return this
    }
//    publish(topic: string, message: string | Buffer, opts: mqttlib.IClientPublishOptions, callback?: mqttlib.PacketCallback | undefined): mqttlib.MqttClient {
    publish(topic: string, message: string | Buffer, callback?: mqttlib.PacketCallback | undefined): mqttlib.MqttClient {
        return this.client.publish(topic, message, callback)
    }
}

export class DeconzEventEmitter extends EventEmitter {
    mqtt: MqttEmitter
    logger: Logger

    constructor(logger: Logger) {
        super()
        this.logger = logger
        this.mqtt=new MqttEmitter(mqtturl)
    }

    connect(deconzURL: string) {
		const connection = new WebSocket(deconzURL);
		
		connection.onmessage = event => {
//			console.log("got event from WS", event.data)
			const data=JSON.parse(event.data.toString());
			if ('uniqueid' in data) {
                let hrTime = process.hrtime()
                let msg: deconzEvent = {
                    payload: data,
                    id: (hrTime[0] * 1000000000 + hrTime[1]).toString()
                };
				this.emit(data.uniqueid, msg)
                obj2mqtt(data, `/deconz/${data.uniqueid}/raw`).every((k,v) => {
                    this.mqtt.publish(k[0],k[1])
                    return true;
                })
			} else {
				this.logger.debug("unprocessed websocket event", {event: event.data})
			}
		}
	}

    api_put(path: string, body: Object) {
        return new Promise<http.IncomingMessage>((resolve, reject) => {
            var options = {
                hostname: deconzIP,
                port: 9181,
                method: 'PUT',
                json: true,
                path: `/api/${APIkey}/${path}`
            }

            const cb = function(response: http.IncomingMessage) {
                resolve(response);
            }
            const req = http.request(options, cb)
            req.end(JSON.stringify(body), console.log)
    //		req.end()
        });
    }
}
