import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import path from 'path';
import { logger } from '../logger';
import sharp from 'sharp';

let modelsLoaded = false;

/**
 * Initialize face-api models
 */
async function loadModels() {
  if (modelsLoaded) return;

  try {
    const modelPath = path.join(process.cwd(), 'node_modules', '@vladmandic/face-api', 'model');
    logger.info(`[FaceDetection] Loading models from ${modelPath}`);

    // Set WASM backend
    await tf.setBackend('wasm');
    await tf.ready();
    logger.info(`[FaceDetection] TF backend: ${tf.getBackend()}`);

    // Loading only the tiny face detector for efficiency
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
    
    modelsLoaded = true;
    logger.info('[FaceDetection] Models loaded successfully');
  } catch (error) {
    logger.error('[FaceDetection] Error loading models:', error);
    throw error;
  }
}

/**
 * Detect if there is at least one face in the image
 * @param buffer - Image buffer
 * @returns true if a face is detected, false otherwise
 */
export async function detectFace(buffer: Buffer): Promise<boolean> {
  try {
    await loadModels();

    // Use sharp to get raw pixel data
    const { data, info } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Create tensor from raw data
    const tensor = tf.tensor3d(data, [info.height, info.width, 3]);
    
    // Run detection
    const detections = await faceapi.detectAllFaces(
      tensor as any, 
      new faceapi.TinyFaceDetectorOptions()
    );

    // Dispose tensor to free memory
    tensor.dispose();

    const faceCount = detections.length;
    logger.info(`[FaceDetection] Detected ${faceCount} face(s)`);

    return faceCount > 0;
  } catch (error) {
    logger.error('[FaceDetection] Error during face detection:', error);
    return false; // Fail safe
  }
}
