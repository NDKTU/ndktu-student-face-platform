/**
 * Zoom Meeting SDK'ning audio/video kutubxonalarini `public/lib` ga yuklaydi.
 *
 * Nega kerak. SDK interfeysni `zoom-meeting-embedded.min.js` bilan chizadi,
 * lekin oqimni dekodlash alohida WASM va worklet fayllarida. Ular topilmasa
 * uchrashuv ulanadi, tugmalar ishlaydi, video esa qora qoladi — loyihadagi
 * «qora ekran» aynan shu edi. `init({ assetPath })` ularni shu papkadan oladi.
 *
 * Nega npm paketi emas. `@zoom/meetingsdk` peer sifatida React 18, redux 4.2.1,
 * react-redux 8.1.2 va yana uchtasini talab qiladi; loyihada React 19. Uni
 * qo'shish butun daraxtni buzadi — bir marta sinalganda npm `react-is` ni
 * o'chirib yuborib, `recharts` bilan build'ni sindirgan edi. Fayllar esa
 * o'sha CDN'da ochiq turadi, shuning uchun ularni to'g'ridan-to'g'ri olamiz.
 *
 * Fayllar `public/lib` da saqlanadi va git'ga kirmaydi (~59 MB).
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const SDK_VERSION = '6.2.0';
const CDN = `https://source.zoom.us/${SDK_VERSION}/lib/av`;
const OUT_DIR = new URL('../public/lib/', import.meta.url).pathname;

/** SDK 6.2.0 dagi fayllar. Versiya almashsa ro'yxat ham yangilanadi. */
const FILES = [
    'annoter.min.js', 'audio_dynamic_simd.min.js', 'audio.dynamic.simd.wasm',
    'audio.encode.wasm', 'audio_light_simd.min.js', 'audio.light.simd.wasm',
    'audio_simd.min.js', 'audio.simd.wasm', 'graphics.min.js',
    'js_audio_level_worklet_process_dynamic.min.js',
    'js_audio_level_worklet_process_light.min.js',
    'js_audio_level_worklet_process.min.js', 'js_audio_process.min.js',
    'js_audio_processor_worklet.min.js', 'js_audio_worklet_dynamic_simd.min.js',
    'js_audio_worklet_light_simd.min.js', 'js_audio_worklet.min.js',
    'js_audio_worklet_process.min.js', 'js_audio_worklet_simd.min.js',
    'js_media.min.js', 'js_sharing_audio_worklet.min.js', 'manifest.json',
    'mesh_thread.min.js', 'my_notes_audio.wav', 'net_thread.min.js', 'net.wasm',
    'pako.min.js', 'qrscanner.min.js', 'share_processor.min.js',
    'sharing_m.min.js', 'sharing_mtsimd.min.js', 'sharing_simd.min.js',
    'sharing_s.min.js', 'tp.min.js', 'tp.wasm', 'vb.min.js', 'vb_worker.min.js',
    'video.decode.js', 'video.decode.wasm', 'video_m.min.js', 'video.mt.js',
    'video.mtsimd.js', 'video_mtsimd.min.js', 'video.mtsimd.wasm', 'video.mt.wasm',
    'video_processor.min.js', 'video_share_mtsimd.min.js', 'video.simd.js',
    'video_simd.min.js', 'video.simd.wasm', 'video_s.min.js', 'viperex.wasm',
    'wasm_ssrc_stream_service_dynmod.min.js', 'webgpu_renderer_dynmod.min.js',
    'wmsc.min.js',
    // Virtual background modellari — alohida papkada.
    'vb-resource/dualModel.bin', 'vb-resource/dualModel_v.bin',
    'vb-resource/tf-backend-wasm.min.js', 'vb-resource/tfjs-backend-wasm-simd.wasm',
    'vb-resource/tfjs-backend-wasm-threaded-simd.wasm', 'vb-resource/tf.min.js',
    'vb-resource/vbbuffer.bin', 'vb-resource/vbPreload.js',
    'vb-resource/vbPreloadWorker.js',
];

async function alreadyDownloaded() {
    try {
        // Ichki papkadagilar ham sanaladi: faqat yuqori daraja yetarli emas.
        const top = await readdir(OUT_DIR);
        if (top.length < FILES.length - 9) return false;
        const probe = await stat(join(OUT_DIR, 'js_media.min.js'));
        return probe.size > 0;
    } catch {
        return false;
    }
}

async function download(name) {
    const target = join(OUT_DIR, name);
    await mkdir(dirname(target), { recursive: true });
    const response = await fetch(`${CDN}/${name}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

if (await alreadyDownloaded()) {
    console.log('Zoom lib: allaqachon yuklangan, o\'tkazib yuborildi.');
} else {
    console.log(`Zoom lib: ${FILES.length} ta fayl yuklanmoqda (~59 MB)...`);
    await mkdir(OUT_DIR, { recursive: true });
    // Bir vaqtda 8 tadan: ketma-ket juda sekin, cheksiz parallel esa CDN
    // tomonidan cheklanadi.
    const queue = [...FILES];
    await Promise.all(
        Array.from({ length: 8 }, async () => {
            let name;
            while ((name = queue.shift())) await download(name);
        }),
    );
    console.log('Zoom lib: tayyor.');
}
