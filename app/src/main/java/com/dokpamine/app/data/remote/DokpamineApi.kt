package com.dokpamine.app.data.remote

import com.dokpamine.app.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import java.io.IOException
import java.util.concurrent.TimeUnit

interface DokpamineApi {
    @POST("api/auth/signup") suspend fun signup(@Body body: SignupRequest): TokenResponse
    @POST("api/auth/login") suspend fun login(@Body body: LoginRequest): TokenResponse
    @GET("api/me") suspend fun me(): MeResponse
    @PATCH("api/me") suspend fun updateMe(@Body body: UpdateMeRequest): MeResponse

    @GET("api/catalog/isbn/{isbn}") suspend fun lookupIsbn(@Path("isbn") isbn: String): CatalogBook

    @PUT("api/books/{id}") suspend fun putBook(@Path("id") id: String, @Body body: BookDto): BookDto
    @PUT("api/sessions/{id}") suspend fun putSession(@Path("id") id: String, @Body body: SessionDto): SessionDto
    @PUT("api/reviews/{id}") suspend fun putReview(@Path("id") id: String, @Body body: ReviewDto): ReviewDto
    @PUT("api/quotes/{id}") suspend fun putQuote(@Path("id") id: String, @Body body: QuoteDto): QuoteDto
    @GET("api/sync/snapshot") suspend fun snapshot(): SnapshotResponse

    @GET("api/feed") suspend fun feed(): List<FeedItem>
    @GET("api/feed/{id}") suspend fun feedDetail(@Path("id") id: String): FeedItem
    @POST("api/feed/{id}/like") suspend fun like(@Path("id") id: String): LikeResponse
    @DELETE("api/feed/{id}/like") suspend fun unlike(@Path("id") id: String): LikeResponse

    @GET("api/ranking/weekly") suspend fun weeklyRanking(): RankingResponse

    companion object {
        val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

        fun create(tokenProvider: () -> String?): DokpamineApi {
            val auth = Interceptor { chain ->
                val token = tokenProvider()
                val request = if (token != null) {
                    chain.request().newBuilder().header("Authorization", "Bearer $token").build()
                } else {
                    chain.request()
                }
                chain.proceed(request)
            }
            val client = OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                // NFR-03: 외부 요청은 10초 안에 끝나지 않으면 실패로 처리한다.
                .callTimeout(10, TimeUnit.SECONDS)
                .addInterceptor(auth)
                .apply {
                    if (BuildConfig.DEBUG) {
                        addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
                    }
                }
                .build()
            return Retrofit.Builder()
                .baseUrl(BuildConfig.API_BASE_URL)
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(DokpamineApi::class.java)
        }
    }
}

/** 화면에 보여줄 수 있는 한국어 오류 문구로 바꾼다. */
fun Throwable.userMessage(): String = when (this) {
    is HttpException -> response()?.errorBody()?.string()
        ?.let { runCatching { DokpamineApi.json.decodeFromString<ErrorResponse>(it).message }.getOrNull() }
        ?: "요청을 처리하지 못했어요. (${code()})"
    is IOException -> "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요."
    else -> message ?: "알 수 없는 오류가 발생했어요."
}

val Throwable.httpCode: Int? get() = (this as? HttpException)?.code()
