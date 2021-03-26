import { EventEmitter } from 'events';
import { buttonRepeatInterval } from '../index'
import { clearInterval, setTimeout, setInterval } from 'timers';
import {DeconzEventEmitter} from './utils'

export var dimmers: {
	[key: string]: AbstractDimmer
} = {}
export var dayLightSensors: {
	[key: string]: AbstractDayLightSensor
} = {}
export var motionSensors: {
	[key: string]: AbstractMotionSensor
} = {}
export var temperatureSensors: {
	[key: string]: AbstractTemperatureSensor
} = {}
export var lightLevelSensors: {
	[key: string]: AbstractLightLevelSensor
} = {}
export var genericStatusSensors: {
	[key: string]: AbstractGenericStatusSensor
} = {}
export var openCloseSensors: {
	[key: string]: AbstractOpenCloseSensor
} = {}

export class AbstractSensor extends EventEmitter {
	id: string
	uniqueid: string
	name: string
	protected enabled: boolean
	protected timer: any//NodeJS.Timeout | undefined

	protected state: Object

	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		super()

		this.id = id;
		this.uniqueid = data.uniqueid;
		this.name = data.name;
		this.enabled = true

		this.wshandler = this.wshandler.bind(this);

		this.state = data.state
		this.timer = setTimeout(()=>{})
		//Object.assign(this.state, data.state)
		deconz.on(this.uniqueid, this.wshandler);
	}
	enable() {
		this.enabled = true
	}
	disable() {
		this.enabled = false
	}

	wshandler(event: any, err: any) {
//		throw new NotImplementedError();
		console.log("TODO: sensor message is not handled", event, this);
		if ('state' in event) {
			Object.assign(this.state, event.state)
		}
		//this.state = event.state
	}
	
    ona(event: string | string[], listener: (...args: any[]) => void): this {
//    on(event: string | symbol, listener: Function): this {
		if (Array.isArray(event))
			event.every((event: string) => {
				super.on(event, listener)
				return true
			})
		else
			super.on(event, listener)
        return this
    }
}

class AbstractDayLightSensor extends AbstractSensor {
}

export class AbstractDimmer extends AbstractSensor {
	public inverted: boolean;
	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		super(id=id, data=data, deconz=deconz)
		this.inverted = false;
		this.buttonTick = this.buttonTick.bind(this);
	}

	buttonTick(eventLabel: string) {
		console.log('ticking', eventLabel);
		this.emit(eventLabel, this);
	}

	wshandler(event: any, err: any) {
//		throw new NotImplementedError
	}
}

interface MotionSensorState {
	dark?: boolean
	lastupdated?: string
	presence: boolean
}

class AbstractMotionSensor extends AbstractSensor {
	protected state: MotionSensorState
	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		super(id,data,deconz)
		this.state = {
			presence: false
		}
	}
	wshandler(event: any, err: any) {
		if ('state' in event) {
			this.state = event.state
			if(this.enabled === true)
				if(this.state.presence === true)
					this.emit('motion')
				else
					this.emit('motion_gone')
		}
	}
}

class AbstractGenericStatusSensor extends AbstractSensor {

}

class SoftwareGenericStatusSensor extends AbstractGenericStatusSensor {
}

class IkeaMotionSensor extends AbstractMotionSensor {
}

class PhilipsIndoorMotionSensor extends AbstractMotionSensor {
}
class PhilipsOutdoorMotionSensor extends AbstractMotionSensor {
}
class SoftwareMotionSensor extends AbstractMotionSensor {
}

interface OpenCloseSensorState {
	lastupdated?: string
	open: boolean | undefined
}

export class AbstractOpenCloseSensor extends AbstractSensor {
	state: OpenCloseSensorState
	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		super(id, data, deconz)
		this.state = {
			lastupdated: data.state.lastupdated,
			open: data.state.open
		}
	}

	wshandler(event: any, err: any) {
		if ('state' in event) {
			this.state = event.state
			if(this.enabled === true)
				if(this.state.open === true)
					this.emit('opened', this)
				else
					this.emit('closed', this)
		}
	}
}

export class AqaraOpenCloseSensor extends AbstractOpenCloseSensor {

}

class IkeaTwoWayDimmer extends AbstractDimmer {
	wshandler(event: any, err: any) {
		if ('state' in event) {
			if ('buttonevent' in event.state) {
				switch([this.inverted, event.state.buttonevent].join()) {
					case 'true,2002':
					case 'false,1002':
						this.emit('pressed_on', this);
						break;
					case 'true,1002':
					case 'false,2002':
						this.emit('pressed_off', this)
						break;
					case 'true,2001':
					case 'false,1001':
						this.emit('hold_dim_up', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_dim_up')
						break;
					case 'true,2003':
					case 'false,1003':
						clearInterval(this.timer)
						this.emit('release_dim_up', this)
						break;
					case 'true,1001':
					case 'false,2001':
						this.emit('hold_dim_down', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_dim_down')
						break;
					case 'true,1003':
					case 'false,2003':
						clearInterval(this.timer)
						this.emit('release_dim_down', this)
						break;
					default:
						console.log(`TODO: handler for button event ${event.state.buttonevent} is not implemented.`)
				}
			}
		}
	}
}

class IkeaFiveWayDimmer extends AbstractDimmer {
}

class PhilipsFourWayDimmer extends AbstractDimmer {
	wshandler(event: any, err: any) {
		if ('state' in event) {
			if ('buttonevent' in event.state) {
				switch(event.state.buttonevent) {
					case 1000: this.emit('pressed_on', this); break;
					case 1002: this.emit('released_on', this); break;
					case 1001: if(!this.timer){ this.emit('hold_on', this); this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_on')}; break;
					case 1003: this.emit('release_hold_on', this); clearInterval(this.timer); this.timer=undefined; break;
					case 2000: this.emit('pressed_dim_up', this); break;
					case 2002: this.emit('released_dim_up', this); break;
					case 2001: if(!this.timer){ this.emit('hold_dim_up', this); this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_dim_up')}; break;
					case 2003: this.emit('release_hold_dim_up', this); clearInterval(this.timer); this.timer=undefined; break;
					case 3000: this.emit('pressed_dim_down', this); break;
					case 3002: this.emit('released_dim_down', this); break;
					case 3001: if(!this.timer){ this.emit('hold_dim_down', this); this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_dim_down')}; break;
					case 3003: this.emit('release_hold_dim_down', this); clearInterval(this.timer); this.timer=undefined; break;
					case 4000: this.emit('pressed_off', this); break;
					case 4002: this.emit('released_off', this); break;
					case 4001: if(!this.timer){ this.emit('hold_off', this); this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_off')}; break;
					case 4003: this.emit('release_hold_off', this); clearInterval(this.timer); this.timer=undefined; break;
					default:
						console.log(`handler for button event ${event.state.buttonevent} is not implemented.`)
				}
			}
		}
	}
}

class AbstractTemperatureSensor extends AbstractSensor {
	state!: TemperatureSensorState
	wshandler(event: any, err: any) {
		if ('state' in event) {
			this.state = event.state
		}
	}
}

class PhilipsIndoorTemperatureSensor extends AbstractTemperatureSensor {
}
class PhilipsOutdoorTemperatureSensor extends AbstractTemperatureSensor {
}
interface LightLevelSensorState {
	lastupdated: string
	dark: boolean
	daylight: boolean
	lightlevel: number
	lux: number
}

class AbstractLightLevelSensor extends AbstractSensor {
	protected state!: LightLevelSensorState
	wshandler(event: any, err: any) {
		if ('state' in event) {
			this.state = event.state
		}
	}

	get is_dark() {
		return this.state.dark;
	}

	get is_daylight() {
		return this.state.daylight;
	}

	get get_lux() {
		return this.state.lux;
	}
}

class PhilipsIndoorLightLevelSensor extends AbstractLightLevelSensor {
}

class PhilipsOutdoorLightLevelSensor extends AbstractLightLevelSensor {
}
class SoftwareDayLightSensor extends AbstractLightLevelSensor {
}

class AqaraTwoWayDimmer extends AbstractDimmer {
	wshandler(event: any, err: any) {
		if ('state' in event) {
			if ('buttonevent' in event.state) {
				clearInterval(this.timer)
				switch([this.inverted, event.state.buttonevent].join()) {
					case 'true,2002':
					case 'false,1002':
						this.emit('pressed_on', this);
						break;
					case 'true,2004':
					case 'false,1004':
						this.emit('pressed_on_double', this);
						break;
					case 'true,2005':
					case 'false,1005':
						this.emit('pressed_on_triple', this);
						break;
					case 'true,2001':
					case 'false,1001':
						this.emit('hold_on', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_on')
						break;
					case 'true,2003':
					case 'false,1003':
						clearInterval(this.timer)
						this.emit('release_off', this)
						break;
					case 'true,1002':
					case 'false,2002':
						this.emit('pressed_off', this);
						break;
					case 'true,1004':
					case 'false,2004':
						this.emit('pressed_off_double', this);
						break;
					case 'true,1005':
					case 'false,2005':
						this.emit('pressed_off_triple', this);
						break;
					case 'true,1001':
					case 'false,2001':
						this.emit('hold_off', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_off')
						break;
					case 'true,1003':
					case 'false,2003':
						clearInterval(this.timer)
						this.emit('release_off', this)
						break;
					default:
						console.log(`handler for button event ${event.state.buttonevent} is not implemented.`)
				}
			}
		}
	}
}

class AqaraFourWayDimmer extends AqaraTwoWayDimmer {
	wshandler(event: any, err: any) {
		if ('state' in event) {
			if ('buttonevent' in event.state) {
				clearInterval(this.timer)
				switch([this.inverted, event.state.buttonevent].join()) {
					//top row
					case 'true,4002':
					case 'false,1002':
						this.emit('pressed_btn1', this);
						break;
					case 'true,4004':
					case 'false,1004':
						this.emit('pressed_btn1_double', this);
						break;
					case 'true,4005':
					case 'false,1005':
						this.emit('pressed_btn1_triple', this);
						break;
					case 'true,4001':
					case 'false,1001':
						this.emit('hold_btn1', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_btn1')
						break;
					case 'true,4003':
					case 'false,1003':
						clearInterval(this.timer)
						this.emit('release_btn1', this)
						break;

					case 'true,3002':
					case 'false,2002':
						this.emit('pressed_btn2', this);
						break;
					case 'true,3004':
					case 'false,2004':
						this.emit('pressed_btn2_double', this);
						break;
					case 'true,3005':
					case 'false,2005':
						this.emit('pressed_btn2_triple', this);
						break;
					case 'true,3001':
					case 'false,2001':
						this.emit('hold_btn2', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_btn2')
						break;
					case 'true,3003':
					case 'false,2003':
						clearInterval(this.timer)
						this.emit('release_btn2', this)
						break;

					//bottom row
					case 'true,2002':
					case 'false,3002':
						this.emit('pressed_btn3', this);
						break;
					case 'true,2004':
					case 'false,3004':
						this.emit('pressed_btn3_double', this);
						break;
					case 'true,2005':
					case 'false,3005':
						this.emit('pressed_btn3_triple', this);
						break;
					case 'true,2001':
					case 'false,3001':
						this.emit('hold_btn3', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_btn3')
						break;
					case 'true,2003':
					case 'false,3003':
						clearInterval(this.timer)
						this.emit('release_btn3', this)
						break;

					case 'true,1002':
					case 'false,4002':
						this.emit('pressed_btn4', this);
						break;
					case 'true,1004':
					case 'false,4004':
						this.emit('pressed_btn4_double', this);
						break;
					case 'true,1005':
					case 'false,4005':
						this.emit('pressed_btn4_triple', this);
						break;
					case 'true,1001':
					case 'false,4001':
						this.emit('hold_btn4', this)
						this.timer = setInterval(this.buttonTick, buttonRepeatInterval, 'tick_btn4')
						break;
					case 'true,1003':
					case 'false,4003':
						clearInterval(this.timer)
						this.emit('release_btn4', this)
						break;

					default:
						console.log(`handler for button event ${event.state.buttonevent} is not implemented.`)
				}
			}
		}
	}
}


interface TemperatureSensorState {
	lastupdated: string
	temperature: number
}

export function sensorsFactory(sensors_object: Object, deconz: DeconzEventEmitter) {
	for(const[id, data] of Object.entries(sensors_object)) {
		process.stdout.write(".")
		switch(`${data.type}/${data.manufacturername}/${data.modelid}`) {
			case 'ZHASwitch/IKEA of Sweden/TRADFRI on/off switch':
				dimmers[data.uniqueid] = new IkeaTwoWayDimmer(id, data, deconz);
				break;
			case 'Daylight/Philips/PHDL00': // this is the dummy daylight sensor from deCONZ
				dayLightSensors[data.uniqueid] = new SoftwareDayLightSensor(id, data, deconz);
				break;
			case 'ZHASwitch/IKEA of Sweden/TRADFRI remote control':
				dimmers[data.uniqueid] = new IkeaFiveWayDimmer(id, data, deconz);
				break;
			case 'ZHAPresence/IKEA of Sweden/TRADFRI motion sensor':
				motionSensors[data.uniqueid] = new IkeaMotionSensor(id, data, deconz)
				break;
			case 'ZHAPresence/Philips/SML001':
				motionSensors[data.uniqueid] = new PhilipsIndoorMotionSensor(id, data, deconz)
				break;
			case 'ZHAPresence/Philips/SML002':
				motionSensors[data.uniqueid] = new PhilipsOutdoorMotionSensor(id, data, deconz)
				break;
			case 'ZHATemperature/Philips/SML001':
				temperatureSensors[data.uniqueid] = new PhilipsIndoorTemperatureSensor(id, data, deconz)
				break;
			case 'ZHATemperature/Philips/SML002':
				temperatureSensors[data.uniqueid] = new PhilipsOutdoorTemperatureSensor(id, data, deconz)
				break;
			case 'ZHALightLevel/Philips/SML001':
				lightLevelSensors[data.uniqueid] = new PhilipsIndoorLightLevelSensor(id, data, deconz)
				break;
			case 'ZHALightLevel/Philips/SML002':
				lightLevelSensors[data.uniqueid] = new PhilipsOutdoorLightLevelSensor(id, data, deconz)
				break;
			case 'CLIPPresence/Phoscon/PHOSCON_VPIR':
				motionSensors[data.uniqueid] = new SoftwareMotionSensor(id, data, deconz)
				break;
			case 'CLIPGenericStatus/Phoscon/PHOSCON_FSM_STATE':
				genericStatusSensors[data.uniqueid] = new SoftwareGenericStatusSensor(id, data, deconz)
				break;
			case 'ZHASwitch/Philips/RWL021':
				dimmers[data.uniqueid] = new PhilipsFourWayDimmer(id, data, deconz)
				break;
			case 'ZHAOpenClose/LUMI/lumi.sensor_magnet.aq2':
				openCloseSensors[data.uniqueid] = new AqaraOpenCloseSensor(id, data, deconz)
				break;
			case 'ZHASwitch/LUMI/lumi.remote.b286opcn01':
				dimmers[data.uniqueid] = new AqaraTwoWayDimmer(id, data, deconz)
				break;
			case 'ZHASwitch/LUMI/lumi.remote.b486opcn01':
				dimmers[data.uniqueid] = new AqaraFourWayDimmer(id, data, deconz)
				break;
			default:
				console.log(`TODO: switch model '${data.modelid}' made by '${data.manufacturername}' (type '${data.type}') is not supported.`)
		}
	}
}
