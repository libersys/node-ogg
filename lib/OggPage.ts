import Debug from 'debug';
import binding from './binding';

const debug = Debug('ogg:decoder');

/**
 * Encapsulates an `ogg_packet` C struct instance. The `ogg_packet`
 * class is a node.js Buffer subclass.
 */
export class OggPage extends Buffer {
    public packets: any = 0;
    public serialno: any = 0;

    constructor() {
        super(binding.sizeof_ogg_page);
    }
}

export default OggPage;
