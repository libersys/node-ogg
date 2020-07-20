import Debug from 'debug';
import binding from './binding';
import { inherits } from 'util';
import { Transform, TransformCallback, Writable, WritableOptions } from 'stream';
import DecoderStream from './DecoderStream';
import OggPage from './OggPage';

const debug = Debug('ogg:decoder');

/**
 * The ogg `Decoder` class. Write an OGG file stream to it, and it'll emit
 * "stream" events for each embedded stream. The DecoderStream instances emit
 * "packet" events with the raw `ogg_packet` instance to send to an ogg stream
 * decoder (like Vorbis, Theora, etc.).
 * @param {Object} options Writable stream options
 */
export class Decoder extends Writable {
    private _streams: { [key: number]: DecoderStream } = {};
    public readonly oy: Buffer;

    constructor(options: WritableOptions) {
        super(options);
        this.oy = new Buffer(binding.sizeof_ogg_sync_state);
        var r = binding.ogg_sync_init(this.oy);
        if (0 !== r) {
            throw new Error('ogg_sync_init() failed: ' + r);
        }
    }

    /**
     * Gets an DecoderStream instance for the given "serialno".
     * Creates one if necessary, and then emits a "stream" event.
     *
     * @param {Number} serialno The serial number of the ogg_stream.
     * @return {DecoderStream} an DecoderStream for the given serial number.
     */
    _stream(serialno: number): DecoderStream {
        debug('_stream(%d)', serialno);
        let stream = this._streams[serialno];
        if (!stream) {
            stream = new DecoderStream(serialno);
            this._streams[serialno] = stream;
            this.emit('stream', stream);
        }
        return stream;
    }

    /**
     * Writable stream base class `_write()` callback function.
     *
     * @param {Buffer} chunk
     * @param {Function} callback
     * @api private
     */
    _write(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        debug('_write(%d bytes)', chunk.length);

        // allocate space for 1 `ogg_page`
        // XXX: we could do this at the per-decoder level, since only 1 ogg_page is
        // active (being processed by an ogg decoder) at a time
        var stream;
        var self = this;
        var oy = this.oy;
        var page = new OggPage();

        binding.ogg_sync_write(oy, chunk, chunk.length, afterWrite);
        function afterWrite(rtn: any) {
            debug('after _write(%d)', rtn);
            if (0 === rtn) {
                pageout();
            } else {
                callback(new Error('ogg_sync_write() error: ' + rtn));
            }
        }

        function pageout() {
            debug('pageout()');
            page.serialno = null;
            page.packets = null;
            binding.ogg_sync_pageout(oy, page, afterPageout);
        }

        const afterPageout = (rtn: any, serialno: any, packets: any) => {
            debug('afterPageout(%d, %d, %d)', rtn, serialno, packets);
            if (1 === rtn) {
                // got a page, now write it to the appropriate DecoderStream
                page.serialno = serialno;
                page.packets = packets;
                self.emit('page', page);
                stream = this._stream(serialno);
                stream.pagein(page, packets, afterPagein);
            } else if (0 === rtn) {
                // need more data
                callback();
            } else {
                // something bad...
                callback(new Error('ogg_sync_pageout() error: ' + rtn));
            }
        };

        function afterPagein(err: Error) {
            debug('afterPagein(%s)', err);
            if (err) return callback(err);
            // attempt to read out the next page from the `ogg_sync_state`
            pageout();
        }
    }
}
