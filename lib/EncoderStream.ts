import Debug from 'debug';
import { Writable } from 'stream';

import OggPacket from './OggPacket';
import binding from './binding';

const debug = Debug('ogg:decoder');

/**
 * The `EncoderStream` class abstracts the `ogg_stream` data structure when
 * used with the encoding interface. You should not need to create instances of
 * `EncoderStream` manually, instead, instances are returned from the
 * `Encoder#stream()` function.
 */
export class EncoderStream extends Writable {
    public readonly serialno: number;
    public readonly os: Buffer;

    constructor(serialno?: number) {
        super({ objectMode: true, highWaterMark: 0 });
        if (serialno === undefined) {
            // TODO: better random serial number algo
            serialno = (Math.random() * 1000000) | 0;
            debug('generated random serial number: %d', serialno);
        }
        this.serialno = serialno;
        this.os = new Buffer(binding.sizeof_ogg_stream_state);
        var r = binding.ogg_stream_init(this.os, serialno);
        if (0 !== r) {
            throw new Error('ogg_stream_init() failed: ' + r);
        }
    }

    /**
     * Overwrite the default .write() function to allow for `ogg_packet` ref-struct
     * instances to be passed in directly.
     *
     * @api public
     */
    write(packet: OggPacket, encoding: BufferEncoding, callback: Function) {
        if (packet && !Buffer.isBuffer(packet) && 'e_o_s' in packet) {
            // // meh... hacky check for ref-struct instance
            // var pageout = packet.pageout,
            //     flush = packet.flush;
            // args[0] = packet.ref();
            // args[0].pageout = pageout;
            // args[0].flush = flush;
        }
    }

    /**
     * Request that `ogg_stream_pageout()` be called on this stream.
     *
     * @param {Function} fn callback function
     * @api public
     */
    pageout(callback: Function) {
        debug('pageout()');
        return this.write.call(this, { pageout: true }, callback);
    }

    /**
     * Request that `ogg_stream_flush()` be called on this stream.
     *
     * @param {Function} callback callback function
     */
    flush(callback: Function) {
        debug('flush()');
        return this.write.call(this, { flush: true }, callback);
    }

    /**
     * Writable stream _write() callback function.
     * Takes the given `ogg_packet` and calls `ogg_stream_packetin()` on it.
     * If a "flush" or "pageout" command was given, then that function will be called
     * in an attempt to output any possible `ogg_page` instances.
     * it into an `ogg_page` instance.
     *
     * @param {Buffer} packet `ogg_packet` struct instance
     * @api private
     */
    _write(packet: OggPacket, encoding: BufferEncoding, callback: Function) {
        const checkCommand = (err?: Error) => {
            if (err) return callback(err);
            debug('checking if "packet" contains a "pageout"/"flush" command');
            if (packet.flush) {
                this._flush(callback);
            } else if (packet.pageout) {
                this._pageout(callback);
            } else {
                callback();
            }
        };
        if (Buffer.isBuffer(packet)) {
            // assumed to be an `ogg_packet` Buffer instance
            this._packetin(packet, checkCommand);
        } else {
            checkCommand();
        }
    }

    /**
     * Calls `ogg_stream_packetin()`.
     */
    _packetin(packet: OggPacket, callback: Function) {
        debug('_packetin()');
        binding.ogg_stream_packetin(this.os, packet, (rtn: any) => {
            debug('ogg_stream_packetin() return = %d', rtn);
            if (0 === rtn) {
                callback();
            } else {
                callback(new Error(rtn));
            }
        });
    }

    /**
     * Calls `ogg_stream_pageout()` repeatedly until it returns 0.
     */
    _pageout(callback: Function) {
        debug('_pageout()');
        var os = this.os;
        var og = new Buffer(binding.sizeof_ogg_page);
        binding.ogg_stream_pageout(os, og, (rtn: any, hlen: any, blen: any, e_o_s: any) => {
            debug('ogg_stream_pageout() return = %d (hlen=%s) (blen=%s) (eos=%s)', rtn, hlen, blen, e_o_s);
            if (0 === rtn) {
                callback();
            } else {
                this.emit('page', this, og, hlen, blen, e_o_s);
                this._pageout(callback);
            }
        });
    }

    /**
     * Calls `ogg_stream_flush()` repeatedly until it returns 0.
     */
    _flush(callback: Function) {
        debug('_flush()');
        var os = this.os;
        var og = new Buffer(binding.sizeof_ogg_page);
        binding.ogg_stream_flush(os, og, (rtn: any, hlen: any, blen: any, e_o_s: any) => {
            debug('ogg_stream_flush() return = %d (hlen=%s) (blen=%s) (eos=%s)', rtn, hlen, blen, e_o_s);
            if (0 === rtn) {
                callback();
            } else {
                this.emit('page', this, og, hlen, blen, e_o_s);
                this._flush(callback);
            }
        });
    }
}

export default EncoderStream;
