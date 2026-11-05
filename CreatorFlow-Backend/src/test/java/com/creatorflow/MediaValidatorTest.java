package com.creatorflow;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;

import static org.junit.jupiter.api.Assertions.*;

class MediaValidatorTest {
    @Test void acceptsCompleteImagesAndRejectsCorruptOrSpoofedImages() throws Exception {
        Path png=Files.createTempFile("cf-image-",".png"),jpeg=Files.createTempFile("cf-image-",".jpg");
        var validator=new MediaValidator("ffmpeg");
        try {
            var image=new BufferedImage(8,8,BufferedImage.TYPE_INT_RGB);
            assertTrue(ImageIO.write(image,"png",png.toFile()));
            assertTrue(ImageIO.write(image,"jpeg",jpeg.toFile()));
            validator.validate(png,"image/png");validator.validate(jpeg,"image/jpeg");
            assertEquals("MEDIA_MIME_MISMATCH",assertThrows(MediaValidator.InvalidMedia.class,()->validator.validate(png,"image/jpeg")).code);
            Files.write(png,java.util.Arrays.copyOf(Files.readAllBytes(png),(int)Files.size(png)-12));
            Files.write(jpeg,java.util.Arrays.copyOf(Files.readAllBytes(jpeg),(int)Files.size(jpeg)-2));
            assertEquals("MEDIA_INVALID",assertThrows(MediaValidator.InvalidMedia.class,()->validator.validate(png,"image/png")).code);
            assertEquals("MEDIA_INVALID",assertThrows(MediaValidator.InvalidMedia.class,()->validator.validate(jpeg,"image/jpeg")).code);
        } finally {Files.deleteIfExists(png);Files.deleteIfExists(jpeg);}
    }
    @Test void decodesRealWavAndMp4ButRejectsTruncatedContainers() throws Exception {
        String ffmpeg=System.getenv().getOrDefault("FFMPEG_PATH","ffmpeg");
        try {new ProcessBuilder(ffmpeg,"-version").start().waitFor();}
        catch(Exception e){Assumptions.assumeTrue(false,"FFmpeg unavailable");}
        Path wav=Files.createTempFile("cf-audio-",".wav"),mp4=Files.createTempFile("cf-video-",".mp4");
        var validator=new MediaValidator(ffmpeg);
        try {
            assertEquals(0,new ProcessBuilder(ffmpeg,"-nostdin","-loglevel","error","-y","-f","lavfi","-i","sine=frequency=440:duration=0.5",wav.toString()).start().waitFor());
            assertEquals(0,new ProcessBuilder(ffmpeg,"-nostdin","-loglevel","error","-y","-f","lavfi","-i","color=c=blue:s=64x64:d=0.5","-c:v","mpeg4",mp4.toString()).start().waitFor());
            validator.validate(wav,"audio/wav");validator.validate(mp4,"video/mp4");
            Files.write(wav,java.util.Arrays.copyOf(Files.readAllBytes(wav),44));
            Files.write(mp4,java.util.Arrays.copyOf(Files.readAllBytes(mp4),24));
            assertEquals("MEDIA_INVALID",assertThrows(MediaValidator.InvalidMedia.class,()->validator.validate(wav,"audio/wav")).code);
            assertEquals("MEDIA_INVALID",assertThrows(MediaValidator.InvalidMedia.class,()->validator.validate(mp4,"video/mp4")).code);
        } finally {Files.deleteIfExists(wav);Files.deleteIfExists(mp4);}
    }
}
