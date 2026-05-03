package by.av.avbyusd

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.io.BufferedReader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var injectScript: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
        }
        webView.webChromeClient = WebChromeClient()

        injectScript = assets.open("inject.js").bufferedReader().use(BufferedReader::readText)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val u = url ?: return
                if (!u.contains("av.by", ignoreCase = true)) return
                val script = injectScript ?: return
                view?.evaluateJavascript(script, null)
            }
        }

        webView.loadUrl("https://cars.av.by/")
    }

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
