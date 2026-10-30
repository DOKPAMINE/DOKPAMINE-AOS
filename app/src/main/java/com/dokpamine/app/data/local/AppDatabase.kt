package com.dokpamine.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [BookEntity::class, SessionEntity::class, ReviewEntity::class, QuoteEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun bookDao(): BookDao
    abstract fun sessionDao(): SessionDao
    abstract fun reviewDao(): ReviewDao
    abstract fun quoteDao(): QuoteDao
    abstract fun syncStatusDao(): SyncStatusDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "dokpamine.db").build()
    }
}
