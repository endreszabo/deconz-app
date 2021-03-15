
import { LightState } from './lights'

export class Scene {
	public state: LightState
	public enabled: boolean
	public readonly name: string
	public priority: number
	public timer: NodeJS.Timeout | null = null;
	public transparent: boolean

	constructor(name: string, priority = 0, transparent = false) {
		this.transparent = transparent
		this.enabled = true
		this.priority = priority
		this.state = {}
		this.name = name
		this.timer = null;
	}

	set lightState(state: LightState) {
		this.state = state
	}

	get brightness() {
		return <number>this.state.bri
	}

	set brightness(bri: number) {
		this.state.bri = bri
		if (this.state.bri > 254) {
			this.state.bri = 254
		} else if (this.state.bri < 0) {
			this.state.bri = 0
		}
	}
	inc_brightness(bri: number) {
		this.state.bri += bri
		if (this.state.bri > 254) {
			this.state.bri = 254
		}
	}
	dec_brightness(bri: number) {
		this.state.bri -= bri
		if (this.state.bri < 1) {
			this.state.bri = 1
		}
	}

	get is_enabled() {
		return this.enabled
	}

	get color_temp() {
		return this.state.ct
	}

	disable() {
		this.enabled = false
	}
	enable() {
		this.enabled = true
	}
}
