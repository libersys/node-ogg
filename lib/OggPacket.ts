import Debug from 'debug';
import binding from './binding';

const debug = Debug('ogg:decoder');

/**
 * Encapsulates an `ogg_packet` C struct instance. The `ogg_packet`
 * class is a node.js Buffer subclass.
 */
export class OggPacket extends Buffer {
    private _packet?: Buffer;
    public _callback: any;

    constructor() {
        super(binding.sizeof_ogg_packet);
        if (this.length != binding.sizeof_ogg_packet) {
            throw new Error('"buffer.length" = ' + this.length + ', expected ' + binding.sizeof_ogg_packet);
        }
    }

    get packet() {
        return binding.ogg_packet_get_packet(this);
    }

    set packet(value: any) {
        binding.ogg_packet_set_packet(this, value);
    }

    get packetno() {
        return binding.ogg_packet_packetno(this);
    }

    get granulepos() {
        return binding.ogg_packet_granulepos(this);
    }

    get b_o_s() {
        return binding.ogg_packet_b_o_s(this);
    }

    get e_o_s() {
        return binding.ogg_packet_e_o_s(this);
    }

    get bytes() {
        return binding.ogg_packet_bytes(this);
    }

    /**
     * Creates a new Buffer instance to back this `ogg_packet` instance.
     * Typically this function is used to take control over the bytes backing the
     * `ogg_packet` instance when the library that filled the packet reuses the
     * backing memory store for each `ogg_packet` instance.
     */
    replace() {
        const buf = new Buffer(this.bytes);
        binding.ogg_packet_replace_buffer(this, buf);

        // keep a reference to "buf" so it doesn't get GC'd
        this._packet = buf;
    }
}

export default OggPacket;
