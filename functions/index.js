/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
 'use strict';

 const functions = require('firebase-functions');
 const admin = require('firebase-admin');
 const mkdirp = require('mkdirp');
 const spawn = require('child-process-promise').spawn;
 const path = require('path');
 const os = require('os');
 const fs = require('fs');

 // Imports the Google Cloud client library (TEMPORARY FOR ML)
 const vision = require('@google-cloud/vision');
 
 admin.initializeApp();
 
 // File extension for the created JPEG files.
 const JPEG_EXTENSION = '.jpg';

 // Creates a client
 const client = new vision.ImageAnnotatorClient();
 
 exports.gcsObjectChanges = functions.storage.object().onFinalize(async (object) => {
   const filePath = object.name;
   const baseFileName = path.basename(filePath, path.extname(filePath));
   const fileDir = path.dirname(filePath);
   const JPEGFileName = path.normalize(path.format({dir: fileDir, name: baseFileName+"_converted", ext: JPEG_EXTENSION}));
   const tempLocalFile = path.join(os.tmpdir(), filePath);
   const tempLocalDir = path.dirname(tempLocalFile);
   const tempLocalJPEGFile = path.join(os.tmpdir(), JPEGFileName);
 
   // Exit if this is triggered on a file that is not an image.
   if (!object.contentType.startsWith('image/')) {
     functions.logger.log('This is not an image.');
     return null;
   }
 
   // Exit if the image is already a JPEG.
   if (object.contentType.startsWith('image/jpeg')) {
     functions.logger.log('Already a JPEG.');
     return null;
   }
 
   // Catch the default Cloud Storage used for Firebase project
   const bucket = admin.storage().bucket(object.bucket);
   // Create the temp directory where the storage file will be downloaded.
   await mkdirp(tempLocalDir);
   // Download file from bucket.
   await bucket.file(filePath).download({destination: tempLocalFile});
   functions.logger.log('The file has been downloaded to', tempLocalFile);

   // Performs label detection on the image file
   const [labelResult] = await client.labelDetection(tempLocalFile);
   const labels = labelResult.labelAnnotations;
   labels.forEach(label => functions.logger.log("Label detection result:", label.description));
   
   // Store Image Information on Firestore
   const bucketName = ""
   let labelsAsInformation = [];
   labels.forEach(label => labelsAsInformation.push(label.description));
//    const writeResult = await admin.firestore().collection('images').add({imagePath: JPEGFileName, information: labelsAsInformation});
   const writeResult = await admin.firestore().collection('images').doc(JPEGFileName).set({imagePath: JPEGFileName, information: labelsAsInformation});

   functions.logger.log('JPEG image created at', tempLocalJPEGFile);
   functions.logger.log('JPEG image uploaded to Storage at', JPEGFileName);

   // Once the image has been converted delete the local files to free up disk space.
   fs.unlinkSync(tempLocalFile);
   return null;
 });