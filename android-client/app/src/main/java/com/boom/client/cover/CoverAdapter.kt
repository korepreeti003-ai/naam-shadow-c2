package com.boom.client.cover

import android.content.Context
import android.graphics.*
import android.view.*
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.boom.client.R

class CoverAdapter(
    private val ctx: Context,
    private val onPhotoClick: () -> Unit
) : RecyclerView.Adapter<CoverAdapter.VH>() {

    private val count = 30

    private val gradients = listOf(
        intArrayOf(0xFFE91E63.toInt(), 0xFF9C27B0.toInt()),
        intArrayOf(0xFF3F51B5.toInt(), 0xFF2196F3.toInt()),
        intArrayOf(0xFF009688.toInt(), 0xFF4CAF50.toInt()),
        intArrayOf(0xFFFF5722.toInt(), 0xFFFF9800.toInt()),
        intArrayOf(0xFF795548.toInt(), 0xFF607D8B.toInt()),
        intArrayOf(0xFF673AB7.toInt(), 0xFF3F51B5.toInt()),
        intArrayOf(0xFF00BCD4.toInt(), 0xFF03A9F4.toInt()),
        intArrayOf(0xFF8BC34A.toInt(), 0xFFCDDC39.toInt()),
        intArrayOf(0xFFFF4081.toInt(), 0xFFFF6E40.toInt()),
        intArrayOf(0xFF1A237E.toInt(), 0xFF0D47A1.toInt())
    )

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val ivThumb: ImageView = view.findViewById(R.id.ivThumb)
        val tvLocked: TextView = view.findViewById(R.id.tvLocked)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(ctx).inflate(R.layout.item_photo, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val bmp = makeBlurredThumbnail(position)
        holder.ivThumb.setImageBitmap(bmp)
        holder.tvLocked.text = if (position % 5 == 0) "🔒" else ""
        holder.itemView.setOnClickListener { onPhotoClick() }
    }

    override fun getItemCount() = count

    private fun makeBlurredThumbnail(index: Int): Bitmap {
        val size = 300
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)

        val grad = gradients[index % gradients.size]
        val paint = Paint().apply {
            shader = RadialGradient(
                size / 2f, size / 2f, size / 1.5f,
                grad[0], grad[1], Shader.TileMode.CLAMP
            )
        }
        canvas.drawRect(0f, 0f, size.toFloat(), size.toFloat(), paint)

        val noisePaint = Paint().apply { alpha = 60 }
        val rng = java.util.Random(index.toLong() * 37)
        repeat(12) {
            noisePaint.color = Color.WHITE
            canvas.drawCircle(
                rng.nextInt(size).toFloat(),
                rng.nextInt(size).toFloat(),
                rng.nextInt(60).toFloat() + 20f,
                noisePaint
            )
        }

        val vignette = Paint().apply {
            shader = RadialGradient(
                size / 2f, size / 2f, size / 1.2f,
                Color.TRANSPARENT, Color.parseColor("#88000000"),
                Shader.TileMode.CLAMP
            )
        }
        canvas.drawRect(0f, 0f, size.toFloat(), size.toFloat(), vignette)

        return stackBlur(bmp, 8)
    }

    private fun stackBlur(bmp: Bitmap, radius: Int): Bitmap {
        val out = bmp.copy(bmp.config, true)
        val w = out.width; val h = out.height
        val px = IntArray(w * h)
        out.getPixels(px, 0, w, 0, 0, w, h)
        for (y in 0 until h) {
            for (x in radius until w - radius) {
                var r = 0; var g = 0; var b = 0
                val span = radius * 2 + 1
                for (dx in -radius..radius) {
                    val c = px[y * w + x + dx]
                    r += (c shr 16) and 0xFF
                    g += (c shr 8) and 0xFF
                    b += c and 0xFF
                }
                px[y * w + x] = (0xFF shl 24) or ((r / span) shl 16) or ((g / span) shl 8) or (b / span)
            }
        }
        out.setPixels(px, 0, w, 0, 0, w, h)
        return out
    }
}
