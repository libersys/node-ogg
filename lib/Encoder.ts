import Debug from 'debug';
import { TransformCallback, Readable, ReadableOptions } from 'stream';

import EncoderStream from './EncoderStream';
import OggPage from './OggPage';
import binding from './binding';
import OggPacket from './OggPacket';

const debug = Debug('ogg:decoder');

export class Encoder extends Readable {
    private _streams: { [key: number]: EncoderStream } = {};
    private _needsEnd = false;

    // a queue of `ogg_page` instances flattened into Buffer instnces. The _read()
    // function should deplete this queue, or wait til the "_page" event to read
    // more
    private _queue: Buffer[] = [];

    constructor(options: ReadableOptions) {
        super(options);
        debug('creating new ogg "Encoder" instance');

        // binded _onpage() call so that we can use it as an event
        // callback function on EncoderStream instances
        this._onpage = this._onpage.bind(this);
    }

    /**
     * Called for each "page" event from every substream EncoderStream instance.
     * Flattens the given `ogg_page` buffer into a regular node.js Buffer.
     */
    _onpage(stream: OggPage, page: any, header_len: any, body_len: any, e_o_s: any) {
        debug('_onpage()');

        if (e_o_s) {
            // stream is done...
            delete this._streams[stream.serialno];
        }

        // got a page!
        var data = new Buffer(header_len + body_len);
        binding.ogg_page_to_buffer(page, data);
        this._queue.push(data);
        this.emit('_page');
    }

    /**
     * Creates a new EncoderStream instance and returns it for the user to begin
     * submitting `ogg_packet` instances to it.
     *
     * @param {Number} serialno The serial number of the stream, null/undefined means random.
     * @return {EncoderStream} The newly created EncoderStream instance. Call `.packetin()` on it.
     * @api public
     */
    stream(serialno: number): EncoderStream {
        debug('stream(%d)', serialno);
        var s = this._streams[serialno];
        if (!s) {
            s = new EncoderStream(serialno);
            s.on('page', this._onpage);
            this._streams[s.serialno] = s;
        }
        return s;
    }

    /**
     * Readable stream base class `_read()` callback function.
     * Processes the _queue array and attempts to read out any available
     * `ogg_page` instances, converted to raw Buffers.
     * , done: Function
     * @param {Number} bytes
     * @param {Function} done
     * @api private
     */
    _read(bytes: number) {
        debug('_read(%d bytes)', bytes);

        const output = () => {
            debug('flushing "_queue" (%d entries)', this._queue.length);
            var buf = Buffer.concat(this._queue);
            this._queue.splice(0); // empty queue

            // check if there's any more streams being processed
            this._needsEnd = Object.keys(this._streams).length === 0;

            this.push(buf);
        };

        if (this._needsEnd) {
            this.push(null); // emit "end"
        } else if (this._queue.length) {
            output();
        } else {
            debug('need to wait for ogg_page Buffer');
            this.once('_page', output);
        }
    }

    // /**
    //  * Convenience function to attach an Ogg stream encoder to this Ogg encoder
    //  * instance.
    //  *
    //  * @param {stream.Readable} stream An Ogg stream encoder that outputs `ogg_packet` Buffer instances.
    //  * @return {ogg.Encoder} Returns `this` for chaining.
    //  * @api public
    //  */
    // use(stream: Readable): Encoder {
    //     stream.pipe(this.stream());
    //     return this;
    // }
}

export default Encoder;
